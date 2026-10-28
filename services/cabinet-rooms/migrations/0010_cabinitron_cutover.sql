-- Cabinitron must be released and verified by the workflow preflight first.
-- Keep the source archive intact. Old in-flight workers must not write after the cutover.
CREATE TABLE cabinitron_cutover(id INTEGER PRIMARY KEY CHECK(id=1),destination TEXT NOT NULL);
INSERT INTO cabinitron_cutover VALUES(1,'from-trees');
CREATE TRIGGER cabinet_rooms_migrated_insert BEFORE INSERT ON rooms BEGIN SELECT RAISE(ABORT,'cabinitron_cutover'); END;
CREATE TRIGGER cabinet_rooms_migrated_update BEFORE UPDATE ON rooms BEGIN SELECT RAISE(ABORT,'cabinitron_cutover'); END;
CREATE TRIGGER cabinet_rooms_migrated_delete BEFORE DELETE ON rooms BEGIN SELECT RAISE(ABORT,'cabinitron_cutover'); END;
