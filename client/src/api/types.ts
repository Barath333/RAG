export type ItemStatus = "processing" | "ready" | "failed";

export interface Item {
  id: string;
  sourceType: "note" | "url";
  title: string;
  sourceUrl: string | null;
  status: ItemStatus;
  error: string | null;
  chunkCount: number;
  createdAt: string;
  preview: string;
}

export interface Source {
  ref: number;
  itemId: string;
  itemTitle: string;
  sourceType: "note" | "url";
  sourceUrl: string | null;
  chunkIndex: number;
  snippet: string;
  score: number;
  cited: boolean;
}

export interface QueryResult {
  answer: string;
  sources: Source[];
}

export type IngestInput = { type: "note"; text: string } | { type: "url"; url: string };
