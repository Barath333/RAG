import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { validateBody } from "../middleware/validate.js";
import { querySchema, type QueryBody } from "../schemas.js";
import type { QueryService } from "../services/queryService.js";

export function queryRouter(query: QueryService): Router {
  const router = Router();
  router.post(
    "/query",
    validateBody(querySchema),
    asyncHandler(async (req, res) => {
      const { question, topK } = req.body as QueryBody;
      res.json(await query.ask(question, topK));
    }),
  );
  return router;
}
