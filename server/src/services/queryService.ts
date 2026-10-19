import type { Repository, SourceType } from "../db/repository.js";
import type { Logger } from "../lib/logger.js";
import type { Embedder } from "./embedder.js";
import type { AnswerGenerator, ContextPassage } from "./llm.js";
import type { Retriever } from "./retriever.js";

export const NO_ANSWER = "I couldn't find anything relevant to that in your saved content.";

export interface Source {
  /** The [n] number used in the answer text. */
  ref: number;
  itemId: string;
  itemTitle: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  chunkIndex: number;
  snippet: string;
  score: number;
  /** True if the model actually cited this passage in its answer. */
  cited: boolean;
}

export interface QueryResult {
  answer: string;
  sources: Source[];
}

export interface QueryDeps {
  repository: Repository;
  embedder: Embedder;
  retriever: Retriever;
  generator: AnswerGenerator;
  logger: Logger;
  defaultTopK: number;
  minSimilarity: number;
}

export class QueryService {
  constructor(private readonly deps: QueryDeps) {}

  async ask(question: string, topK?: number): Promise<QueryResult> {
    const { embedder, retriever, generator, repository, logger, defaultTopK, minSimilarity } = this.deps;

    const [queryVector] = await embedder.embed([question]);
    const hits = retriever.search(queryVector as Float32Array, topK ?? defaultTopK, minSimilarity);
    logger.info({ hits: hits.length, topScore: hits[0]?.score }, "retrieval done");

    // Nothing relevant: skip the LLM entirely (cheaper, and it can't hallucinate an answer).
    if (hits.length === 0) return { answer: NO_ANSWER, sources: [] };

    const sources: Source[] = hits.map((hit, i) => {
      const item = repository.getItem(hit.itemId);
      return {
        ref: i + 1,
        itemId: hit.itemId,
        itemTitle: item?.title ?? "Deleted item",
        sourceType: item?.sourceType ?? "note",
        sourceUrl: item?.sourceUrl ?? null,
        chunkIndex: hit.chunkIndex,
        snippet: hit.content,
        score: Number(hit.score.toFixed(4)),
        cited: false,
      };
    });

    const passages: ContextPassage[] = sources.map((s) => ({ ref: s.ref, title: s.itemTitle, text: s.snippet }));
    const raw = await generator.answer(question, passages);

    // Only trust citations that point at passages we actually sent.
    const validRefs = new Set(sources.map((s) => s.ref));
    const invalid: number[] = [];
    const answer = raw.replace(/\s?\[(\d+)\]/g, (match, n: string) => {
      const ref = Number(n);
      if (validRefs.has(ref)) {
        sources[ref - 1]!.cited = true;
        return match;
      }
      invalid.push(ref);
      return "";
    });
    if (invalid.length) logger.warn({ invalid }, "model cited passages that were not in the context");

    return { answer: answer.trim() || NO_ANSWER, sources };
  }
}
