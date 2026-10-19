import { randomUUID } from "node:crypto";
import type { Db } from "./database.js";
import { fromBuffer, toBuffer } from "../lib/vectors.js";

export type SourceType = "note" | "url";
export type ItemStatus = "processing" | "ready" | "failed";

export interface Item {
  id: string;
  sourceType: SourceType;
  title: string;
  sourceUrl: string | null;
  rawContent: string | null;
  status: ItemStatus;
  error: string | null;
  chunkCount: number;
  createdAt: string;
}

export interface NewItem {
  sourceType: SourceType;
  title: string;
  sourceUrl?: string;
  rawContent?: string;
}

export interface StoredChunk {
  id: number;
  itemId: string;
  chunkIndex: number;
  content: string;
  embedding: Float32Array;
}

interface ItemRow {
  id: string;
  source_type: SourceType;
  title: string;
  source_url: string | null;
  raw_content: string | null;
  status: ItemStatus;
  error: string | null;
  chunk_count: number;
  created_at: string;
}

const toItem = (r: ItemRow): Item => ({
  id: r.id,
  sourceType: r.source_type,
  title: r.title,
  sourceUrl: r.source_url,
  rawContent: r.raw_content,
  status: r.status,
  error: r.error,
  chunkCount: r.chunk_count,
  createdAt: r.created_at,
});

/** All SQL lives here so services never see a query string. */
export class Repository {
  constructor(private readonly db: Db) {}

  createItem(input: NewItem): Item {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO items (id, source_type, title, source_url, raw_content, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'processing', ?)`,
      )
      .run(id, input.sourceType, input.title, input.sourceUrl ?? null, input.rawContent ?? null, new Date().toISOString());
    return this.getItem(id) as Item;
  }

  getItem(id: string): Item | undefined {
    const row = this.db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) as ItemRow | undefined;
    return row ? toItem(row) : undefined;
  }

  listItems(): Item[] {
    const rows = this.db.prepare(`SELECT * FROM items ORDER BY created_at DESC`).all() as ItemRow[];
    return rows.map(toItem);
  }

  listItemsByStatus(status: ItemStatus): Item[] {
    const rows = this.db.prepare(`SELECT * FROM items WHERE status = ? ORDER BY created_at`).all(status) as ItemRow[];
    return rows.map(toItem);
  }

  deleteItem(id: string): boolean {
    return this.db.prepare(`DELETE FROM items WHERE id = ?`).run(id).changes > 0;
  }

  /** Called once the URL body has been fetched, so the raw content is stored alongside the item. */
  updateFetchedContent(id: string, title: string, rawContent: string): void {
    this.db.prepare(`UPDATE items SET title = ?, raw_content = ? WHERE id = ?`).run(title, rawContent, id);
  }

  /** Replace the item's chunks and mark it ready in one transaction (no half-indexed items). */
  markReady(itemId: string, chunks: { content: string; embedding: Float32Array }[]): void {
    const insert = this.db.prepare(
      `INSERT INTO chunks (item_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM chunks WHERE item_id = ?`).run(itemId);
      chunks.forEach((c, i) => insert.run(itemId, i, c.content, toBuffer(c.embedding)));
      this.db
        .prepare(`UPDATE items SET status = 'ready', error = NULL, chunk_count = ? WHERE id = ?`)
        .run(chunks.length, itemId);
    })();
  }

  markFailed(itemId: string, error: string): void {
    this.db.prepare(`UPDATE items SET status = 'failed', error = ? WHERE id = ?`).run(error, itemId);
  }

  /** Every chunk of every ready item. Brute-force search scans this list. */
  getAllReadyChunks(): StoredChunk[] {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.item_id, c.chunk_index, c.content, c.embedding
         FROM chunks c JOIN items i ON i.id = c.item_id
         WHERE i.status = 'ready'`,
      )
      .all() as { id: number; item_id: string; chunk_index: number; content: string; embedding: Buffer }[];
    return rows.map((r) => ({
      id: r.id,
      itemId: r.item_id,
      chunkIndex: r.chunk_index,
      content: r.content,
      embedding: fromBuffer(r.embedding),
    }));
  }
}
