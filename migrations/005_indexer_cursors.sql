-- Indexer resume cursors (swap backfill / poll)

CREATE TABLE IF NOT EXISTS indexer_cursors (
  name            TEXT PRIMARY KEY,
  pool_id         BIGINT REFERENCES pools(id),
  cursor_signature TEXT,
  cursor_slot     BIGINT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
