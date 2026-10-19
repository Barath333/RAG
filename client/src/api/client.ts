import type { IngestInput, Item, QueryResult } from "./types";

const BASE = "/api";

/** Error carrying the server's message, so the UI can show something useful. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Cannot reach the server. Is it running?", 0);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error?.message ?? `Request failed (HTTP ${res.status})`, res.status);
  return body as T;
}

export const api = {
  listItems: () => request<{ items: Item[] }>("/items").then((r) => r.items),
  ingest: (input: IngestInput) =>
    request<{ item: Item }>("/ingest", { method: "POST", body: JSON.stringify(input) }).then((r) => r.item),
  deleteItem: (id: string) => request<void>(`/items/${id}`, { method: "DELETE" }),
  query: (question: string) => request<QueryResult>("/query", { method: "POST", body: JSON.stringify({ question }) }),
};
