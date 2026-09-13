CREATE TABLE cabinet_analytics_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO cabinet_analytics_meta VALUES ('tracking_started_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
CREATE TABLE cabinet_sessions (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  medium TEXT NOT NULL,
  campaign TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE cabinet_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('visit','design','share','email','price','lead')),
  session_id TEXT,
  room_slug TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX cabinet_events_date ON cabinet_events(created_at, kind);
CREATE INDEX cabinet_events_session ON cabinet_events(session_id, kind);
CREATE INDEX rooms_updated ON rooms(updated_at);
