import type { Repository, Item } from "../db/repository.js";
import { AppError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import { chunkText, type ChunkOptions } from "./chunker.js";
import type { Embedder } from "./embedder.js";
import type { UrlFetcher } from "./urlFetcher.js";

export interface IngestDeps {
  repository: Repository;
  embedder: Embedder;
  urlFetcher: UrlFetcher;
  chunkOptions: ChunkOptions;
  logger: Logger;
}

/**
 * Ingestion is asynchronous: the API stores the item as "processing" and returns
 * immediately; fetching, chunking and embedding happen in a background job.
 * Jobs run one at a time through an in-process queue (see README for what changes in production).
 */
export class IngestService {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: IngestDeps) {}

  ingestNote(input: { text: string; title?: string }): Item {
    const title = input.title?.trim() || firstLine(input.text);
    const item = this.deps.repository.createItem({ sourceType: "note", title, rawContent: input.text });
    this.enqueue(item.id);
    return item;
  }

  async ingestUrl(url: string): Promise<Item> {
    await this.deps.urlFetcher.validate(url); // fail fast with 422 on bad/internal URLs
    const item = this.deps.repository.createItem({ sourceType: "url", title: url, sourceUrl: url });
    this.enqueue(item.id);
    return item;
  }

  /** Items left "processing" by a crash/restart are picked up again on boot. */
  recoverPending(): number {
    const pending = this.deps.repository.listItemsByStatus("processing");
    pending.forEach((item) => this.enqueue(item.id));
    return pending.length;
  }

  /** Resolves when all queued jobs have finished. Used by tests and graceful shutdown. */
  whenIdle(): Promise<void> {
    return this.queue;
  }

  private enqueue(itemId: string): void {
    this.queue = this.queue.then(() => this.process(itemId));
  }

  private async process(itemId: string): Promise<void> {
    const { repository, embedder, urlFetcher, chunkOptions, logger } = this.deps;
    const log = logger.child({ itemId });
    const started = Date.now();
    try {
      const item = repository.getItem(itemId);
      if (!item) return; // deleted while queued

      let text = item.rawContent ?? "";
      if (item.sourceType === "url") {
        const page = await urlFetcher.fetchPage(item.sourceUrl as string);
        repository.updateFetchedContent(itemId, page.title, page.text);
        text = page.text;
        log.info({ url: item.sourceUrl, chars: text.length }, "url fetched");
      }

      const chunks = chunkText(text, chunkOptions);
      if (chunks.length === 0) throw new AppError(422, "unprocessable_content", "No text to index.");

      const embeddings = await embedder.embed(chunks);
      repository.markReady(
        itemId,
        chunks.map((content, i) => ({ content, embedding: embeddings[i] as Float32Array })),
      );
      log.info({ chunks: chunks.length, ms: Date.now() - started }, "item indexed");
    } catch (err) {
      // User-facing errors keep their message; anything unexpected is logged in full but shown generically.
      const message = err instanceof AppError ? err.message : "Unexpected error while indexing this item.";
      log.error({ err, ms: Date.now() - started }, "item indexing failed");
      repository.markFailed(itemId, message);
    }
  }
}

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 57)}...` : line || "Untitled note";
}
