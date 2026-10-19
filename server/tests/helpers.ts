import pino from "pino";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db/database.js";
import { Repository } from "../src/db/repository.js";
import { UnprocessableError } from "../src/lib/errors.js";
import { normalize } from "../src/lib/vectors.js";
import type { Embedder } from "../src/services/embedder.js";
import { IngestService } from "../src/services/ingestService.js";
import type { AnswerGenerator, ContextPassage } from "../src/services/llm.js";
import { QueryService } from "../src/services/queryService.js";
import { Retriever } from "../src/services/retriever.js";
import type { FetchedPage, UrlFetcher } from "../src/services/urlFetcher.js";

const DIMS = 128;

/** Deterministic bag-of-words embedding: shared words => higher cosine similarity. No network needed. */
export class FakeEmbedder implements Embedder {
  calls = 0;
  async embed(texts: string[]): Promise<Float32Array[]> {
    this.calls++;
    return texts.map((text) => {
      const v = new Float32Array(DIMS);
      for (const word of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
        let h = 0;
        for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) % DIMS;
        v[h] = (v[h] as number) + 1;
      }
      return normalize(v);
    });
  }
}

/** Cites the first passage, plus any extra refs you ask for (to test citation validation). */
export class FakeGenerator implements AnswerGenerator {
  lastPassages: ContextPassage[] = [];
  constructor(private readonly extraCitation = "") {}
  async answer(_q: string, passages: ContextPassage[]): Promise<string> {
    this.lastPassages = passages;
    return `The answer is in the first passage [1]${this.extraCitation}.`;
  }
}

export class FakeUrlFetcher implements UrlFetcher {
  constructor(private readonly pages: Record<string, FetchedPage | Error> = {}) {}
  async validate(url: string): Promise<void> {
    if (url.includes("10.0.0.1")) throw new UnprocessableError("URLs that point to private or internal addresses are not allowed.");
    if (!/^https?:\/\//.test(url)) throw new UnprocessableError("That is not a valid URL.");
  }
  async fetchPage(url: string): Promise<FetchedPage> {
    const page = this.pages[url];
    if (!page) throw new UnprocessableError("Could not extract readable text from this page.");
    if (page instanceof Error) throw page;
    return page;
  }
}

export function buildTestApp(opts: { generator?: AnswerGenerator; urlFetcher?: UrlFetcher; minSimilarity?: number } = {}) {
  const logger = pino({ level: "silent" });
  const repository = new Repository(openDatabase(":memory:"));
  const embedder = new FakeEmbedder();
  const generator = opts.generator ?? new FakeGenerator();
  const ingestService = new IngestService({
    repository,
    embedder,
    urlFetcher: opts.urlFetcher ?? new FakeUrlFetcher(),
    chunkOptions: { maxChars: 400, overlapChars: 50 },
    logger,
  });
  const queryService = new QueryService({
    repository,
    embedder,
    retriever: new Retriever(repository),
    generator,
    logger,
    defaultTopK: 3,
    minSimilarity: opts.minSimilarity ?? 0.1,
  });
  const app = createApp({ repository, ingestService, queryService, logger, maxNoteChars: 5000 });
  return { app, repository, ingestService, embedder, generator };
}
