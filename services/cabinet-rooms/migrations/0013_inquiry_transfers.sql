-- FTOPS acknowledges only after its own delivery jobs are durable.
CREATE TABLE inquiry_transfers (
  event_id TEXT PRIMARY KEY REFERENCES intake_events(id),
  transferred_at INTEGER NOT NULL
);
