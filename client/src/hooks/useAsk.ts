import { useCallback, useRef, useState } from "react";
import { api } from "../api/client";
import type { QueryResult } from "../api/types";

/** Ask state machine. Ignores responses from superseded requests so answers never show up out of order. */
export function useAsk() {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const ask = useCallback(async (question: string) => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    setAsked(question);
    try {
      const res = await api.query(question);
      if (id === latest.current) setResult(res);
    } catch (e) {
      if (id === latest.current) {
        setResult(null);
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

  return { ask, asked, result, loading, error };
}
