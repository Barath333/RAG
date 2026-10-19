import OpenAI from "openai";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { Repository } from "./db/repository.js";
import { createLogger } from "./lib/logger.js";
import { OpenAIEmbedder } from "./services/embedder.js";
import { IngestService } from "./services/ingestService.js";
import { OpenAIAnswerGenerator } from "./services/llm.js";
import { QueryService } from "./services/queryService.js";
import { Retriever } from "./services/retriever.js";
import { HttpUrlFetcher } from "./services/urlFetcher.js";

function main() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);

  const repository = new Repository(openDatabase(config.DB_PATH));
  const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const embedder = new OpenAIEmbedder(openai, config.EMBEDDING_MODEL);

  const ingestService = new IngestService({
    repository,
    embedder,
    urlFetcher: new HttpUrlFetcher({ timeoutMs: config.URL_FETCH_TIMEOUT_MS, maxBytes: config.URL_MAX_BYTES }),
    chunkOptions: { maxChars: config.CHUNK_MAX_CHARS, overlapChars: config.CHUNK_OVERLAP_CHARS },
    logger: logger.child({ component: "ingest" }),
  });
  const queryService = new QueryService({
    repository,
    embedder,
    retriever: new Retriever(repository),
    generator: new OpenAIAnswerGenerator(openai, config.CHAT_MODEL),
    logger: logger.child({ component: "query" }),
    defaultTopK: config.TOP_K,
    minSimilarity: config.MIN_SIMILARITY,
  });

  const recovered = ingestService.recoverPending();
  if (recovered > 0) logger.info({ recovered }, "re-queued items that were still processing");

  const app = createApp({ repository, ingestService, queryService, logger, maxNoteChars: config.MAX_NOTE_CHARS });
  const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, "server listening"));

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

try {
  main();
} catch (err) {
  // Config errors etc. should be a readable one-liner, not a stack trace dump.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
