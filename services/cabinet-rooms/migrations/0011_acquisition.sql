CREATE TABLE acquisition_events (
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('arrival', 'view', 'inquiry_cta', 'configurator_cta', 'inquiry_accepted', 'ad_attribution')),
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  visitor_id TEXT,
  session_id TEXT,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  PRIMARY KEY (kind, id),
  CHECK ((kind = 'arrival' AND visitor_id IS NULL AND session_id IS NULL)
      OR (kind <> 'arrival' AND visitor_id IS NOT NULL AND session_id IS NOT NULL))
);
CREATE INDEX acquisition_events_time ON acquisition_events (occurred_at, id);
CREATE INDEX acquisition_events_visitor ON acquisition_events (visitor_id, occurred_at, id);
CREATE TRIGGER acquisition_events_no_update
  BEFORE UPDATE ON acquisition_events BEGIN
  SELECT RAISE(ABORT, 'acquisition evidence is immutable');
END;

-- Future trusted integrations append assertions and withdrawals. Association history
-- survives independent expiry of raw tracking events and never rewrites a visitor's history.
CREATE TABLE acquisition_identity_assertions (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('ftops_contact', 'cabinitron_portal_identity')),
  subject_scope TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  asserted_by TEXT NOT NULL,
  asserted_at TEXT NOT NULL
);
CREATE INDEX acquisition_identity_visitor ON acquisition_identity_assertions (visitor_id);
CREATE TABLE acquisition_identity_withdrawals (
  assertion_id TEXT PRIMARY KEY REFERENCES acquisition_identity_assertions(id),
  evidence_ref TEXT NOT NULL,
  withdrawn_by TEXT NOT NULL,
  withdrawn_at TEXT NOT NULL
);
CREATE TRIGGER acquisition_identity_assertions_no_update
  BEFORE UPDATE ON acquisition_identity_assertions BEGIN
  SELECT RAISE(ABORT, 'acquisition identity evidence is immutable');
END;
CREATE TRIGGER acquisition_identity_withdrawals_no_update
  BEFORE UPDATE ON acquisition_identity_withdrawals BEGIN
  SELECT RAISE(ABORT, 'acquisition identity evidence is immutable');
END;
