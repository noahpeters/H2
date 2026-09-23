-- One immutable accepted event; delivery state is independent for each destination.
CREATE TABLE intake_events (
  id TEXT PRIMARY KEY,
  input TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE intake_deliveries (
  event_id TEXT NOT NULL REFERENCES intake_events(id),
  destination TEXT NOT NULL CHECK(destination IN ('resend','ftops')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','review')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  receipt TEXT,
  PRIMARY KEY(event_id,destination)
);
CREATE INDEX intake_due ON intake_deliveries(state,next_attempt);
-- Triggers make accepting the event and enqueueing BOTH deliveries one atomic statement.
CREATE TRIGGER intake_enqueue AFTER INSERT ON intake_events BEGIN
  INSERT INTO intake_deliveries(event_id,destination) VALUES (NEW.id,'resend');
  INSERT INTO intake_deliveries(event_id,destination) VALUES (NEW.id,'ftops');
END;
CREATE TRIGGER intake_immutable BEFORE UPDATE ON intake_events BEGIN
  SELECT RAISE(ABORT,'immutable intake event');
END;
