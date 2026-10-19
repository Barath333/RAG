import type { Item } from "../api/types";

interface Props {
  items: Item[];
  loading: boolean;
  error: string | null;
  onRemove: (id: string) => Promise<void>;
}

const STATUS_LABEL = { processing: "Indexing…", ready: "Ready", failed: "Failed" } as const;

export function ItemList({ items, loading, error, onRemove }: Props) {
  return (
    <section className="panel">
      <h2>Saved items{items.length > 0 && <span className="count"> {items.length}</span>}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && items.length === 0 && !error && <p className="muted">Nothing saved yet. Add a note or a page above.</p>}

      <ul className="items">
        {items.map((item) => (
          <li key={item.id} className="item">
            <div className="item-head">
              <span className="item-title">{item.title}</span>
              <span className={`status ${item.status}`}>{STATUS_LABEL[item.status]}</span>
            </div>
            <p className="item-meta">
              {item.sourceType === "url" ? "Page" : "Note"} · {new Date(item.createdAt).toLocaleString()}
              {item.status === "ready" && ` · ${item.chunkCount} ${item.chunkCount === 1 ? "chunk" : "chunks"}`}
            </p>
            {item.status === "failed" && item.error && <p className="error">{item.error}</p>}
            {item.preview && item.status !== "failed" && <p className="item-preview">{item.preview}</p>}
            <button
              type="button"
              className="link-button"
              onClick={() => void onRemove(item.id).catch(() => undefined)}
              aria-label={`Delete ${item.title}`}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
