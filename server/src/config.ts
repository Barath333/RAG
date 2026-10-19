import "dotenv/config";
import path from "node:path";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.string().default("info"),
  OPENAI_API_KEY: z
    .string({ error: "OPENAI_API_KEY is required. Copy .env.example to .env and set it." })
    .min(1, "OPENAI_API_KEY is required. Copy .env.example to .env and set it."),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  CHAT_MODEL: z.string().default("gpt-4o-mini"),
  DB_PATH: z.string().default(path.resolve(process.cwd(), "data", "inbox.db")),
  // Chunking is measured in characters (~4 chars per token for English).
  CHUNK_MAX_CHARS: z.coerce.number().int().positive().default(1800),
  CHUNK_OVERLAP_CHARS: z.coerce.number().int().nonnegative().default(200),
  // Retrieval
  TOP_K: z.coerce.number().int().positive().max(20).default(5),
  MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.2),
  // Ingestion limits
  MAX_NOTE_CHARS: z.coerce.number().int().positive().default(50_000),
  URL_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  URL_MAX_BYTES: z.coerce.number().int().positive().default(2_000_000),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return parsed.data;
}
