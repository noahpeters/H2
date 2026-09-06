CREATE TABLE room_shares (
  request_id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  room_slug TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE cabinet_leads (
  request_id TEXT PRIMARY KEY,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  room_slug TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consent_at TEXT NOT NULL
);
