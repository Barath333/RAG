import { useState, type FormEvent } from "react";
import type { IngestInput } from "../api/types";

interface Props {
  onAdd: (input: IngestInput) => Promise<void>;
}

export function AddItemForm({ onAdd }: Props) {
  const [mode, setMode] = useState<"note" | "url">("note");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAdd(mode === "note" ? { type: "note", text: value } : { type: "url", url: value });
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel">
      <h2>Save something</h2>
      <div className="tabs" role="tablist">
        {(["note", "url"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? "tab active" : "tab"}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
          >
            {m === "note" ? "Note" : "URL"}
          </button>
        ))}
      </div>

      {mode === "note" ? (
        <textarea
          aria-label="Note text"
          placeholder="Paste or type a note"
          rows={5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      ) : (
        <input
          aria-label="Page URL"
          type="url"
          placeholder="https://example.com/article"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={submitting || !value.trim()}>
        {submitting ? "Saving…" : mode === "note" ? "Save note" : "Save page"}
      </button>
    </form>
  );
}
