ALTER TABLE cabinet_leads ADD COLUMN lead_source TEXT NOT NULL DEFAULT 'share';
CREATE TABLE room_price_requests (
  request_id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  room_slug TEXT NOT NULL,
  room_revision INTEGER NOT NULL,
  study_data TEXT NOT NULL,
  estimate_data TEXT NOT NULL,
  contact_consent INTEGER NOT NULL CHECK (contact_consent IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX room_price_requests_created ON room_price_requests(created_at);
