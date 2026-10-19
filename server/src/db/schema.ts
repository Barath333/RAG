export const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('note', 'url')),
  title       TEXT NOT NULL,
  source_url  TEXT,
  raw_content TEXT,
  status      TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'failed')),
  error       TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL,
  embedding   BLOB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_item ON chunks(item_id);
`;
