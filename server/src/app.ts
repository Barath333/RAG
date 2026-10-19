import express, { type Express } from "express";
import type { Repository } from "./db/repository.js";
import type { Logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { ingestRouter } from "./routes/ingest.js";
import { itemsRouter } from "./routes/items.js";
import { queryRouter } from "./routes/query.js";
import type { IngestService } from "./services/ingestService.js";
import type { QueryService } from "./services/queryService.js";

export interface AppDeps {
  repository: Repository;
  ingestService: IngestService;
  queryService: QueryService;
  logger: Logger;
  maxNoteChars: number;
}

/** Builds the Express app from already-constructed dependencies, so tests can inject fakes. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestLogger(deps.logger));
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(ingestRouter(deps.ingestService, deps.maxNoteChars));
  app.use(itemsRouter(deps.repository));
  app.use(queryRouter(deps.queryService));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
