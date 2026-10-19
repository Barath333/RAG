import { Router } from "express";
import type { Repository } from "../db/repository.js";
import { NotFoundError } from "../lib/errors.js";
import { toPublicItem } from "./presenters.js";

export function itemsRouter(repository: Repository): Router {
  const router = Router();

  router.get("/items", (_req, res) => {
    res.json({ items: repository.listItems().map(toPublicItem) });
  });

  router.delete("/items/:id", (req, res) => {
    if (!repository.deleteItem(req.params.id as string)) throw new NotFoundError("Item not found.");
    res.status(204).end();
  });

  return router;
}
