CREATE TABLE rooms (
  slug TEXT PRIMARY KEY NOT NULL,
  edit_hash TEXT NOT NULL,
  data TEXT NOT NULL CHECK (length(data) <= 200000),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
