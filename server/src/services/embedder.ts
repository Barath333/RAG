import OpenAI from "openai";
import { UpstreamError } from "../lib/errors.js";
import { normalize } from "../lib/vectors.js";

/** Anything that can turn text into unit-length vectors. Swap in a local model by implementing this. */
export interface Embedder {
  embed(texts: string[]): Promise<Float32Array[]>;
}

const BATCH_SIZE = 96;

export class OpenAIEmbedder implements Embedder {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  async embed(texts: string[]): Promise<Float32Array[]> {
    const vectors: Float32Array[] = [];
    try {
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const res = await this.client.embeddings.create({ model: this.model, input: batch });
        // The API returns results with an index; sort to be safe.
        const ordered = [...res.data].sort((a, b) => a.index - b.index);
        for (const d of ordered) vectors.push(normalize(d.embedding));
      }
    } catch (err) {
      throw new UpstreamError(`Embedding request failed: ${describe(err)}`);
    }
    return vectors;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
