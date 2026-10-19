import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { validateBody } from "../middleware/validate.js";
import { ingestSchema, type IngestBody } from "../schemas.js";
import type { IngestService } from "../services/ingestService.js";
import { toPublicItem } from "./presenters.js";

export function ingestRouter(ingest: IngestService, maxNoteChars: number): Router {
  const router = Router();
  router.post(
    "/ingest",
    validateBody(ingestSchema(maxNoteChars)),
    asyncHandler(async (req, res) => {
      const body = req.body as IngestBody;
      const item = body.type === "note" ? ingest.ingestNote(body) : await ingest.ingestUrl(body.url);
      // 202: accepted, indexing continues in the background. Poll GET /items for status.
      res.status(202).json({ item: toPublicItem(item) });
    }),
  );
  return router;
}
