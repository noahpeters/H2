CREATE TABLE custom_cabinets (
  id TEXT PRIMARY KEY NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  thumbnail TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','published','archived')),
  updated_at TEXT NOT NULL
);

CREATE TABLE custom_cabinet_versions (
  cabinet_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  definition TEXT NOT NULL CHECK (length(definition) <= 100000),
  created_at TEXT NOT NULL,
  PRIMARY KEY (cabinet_id, version)
);
