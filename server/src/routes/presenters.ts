import type { Item } from "../db/repository.js";

/** What the API exposes about an item. Raw content stays server-side; clients get a short preview. */
export function toPublicItem(item: Item) {
  return {
    id: item.id,
    sourceType: item.sourceType,
    title: item.title,
    sourceUrl: item.sourceUrl,
    status: item.status,
    error: item.error,
    chunkCount: item.chunkCount,
    createdAt: item.createdAt,
    preview: (item.rawContent ?? "").slice(0, 200),
  };
}
