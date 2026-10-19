import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { IngestInput, Item } from "../api/types";

const POLL_MS = 1500;

/** Owns the saved-items list. Polls while anything is still being indexed, then goes quiet. */
export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await api.listItems());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasProcessing = items.some((i) => i.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [hasProcessing, refresh]);

  const add = useCallback(
    async (input: IngestInput) => {
      const item = await api.ingest(input); // throws ApiError; the form shows the message
      setItems((prev) => [item, ...prev]);
    },
    [],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.deleteItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    [],
  );

  return { items, loading, error, add, remove, refresh };
}
