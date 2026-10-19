import type { Repository, StoredChunk } from "../db/repository.js";
import { dot } from "../lib/vectors.js";

export interface ScoredChunk extends StoredChunk {
  score: number;
}

/**
 * Exact nearest-neighbour search by brute force: score every stored chunk against the query.
 * Vectors are unit length, so the dot product is cosine similarity.
 */
export class Retriever {
  constructor(private readonly repository: Repository) {}

  search(queryVector: Float32Array, topK: number, minScore: number): ScoredChunk[] {
    return this.repository
      .getAllReadyChunks()
      .map((chunk) => ({ ...chunk, score: dot(queryVector, chunk.embedding) }))
      .filter((c) => c.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
