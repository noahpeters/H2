CREATE TABLE acquisition_delivery (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  event_id TEXT NOT NULL,
  UNIQUE (kind, event_id),
  FOREIGN KEY (kind, event_id) REFERENCES acquisition_events(kind, id) ON DELETE RESTRICT
);

CREATE TRIGGER acquisition_enqueue
  AFTER INSERT ON acquisition_events BEGIN
  INSERT INTO acquisition_delivery(kind, event_id) VALUES (NEW.kind, NEW.id);
END;

INSERT INTO acquisition_delivery(kind, event_id)
  SELECT kind, id FROM acquisition_events ORDER BY received_at, kind, id;
