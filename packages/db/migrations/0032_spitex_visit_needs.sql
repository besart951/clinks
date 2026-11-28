-- Each explicit planning period is bounded. Extending a need only adds new visits.
CREATE TABLE spitex_visit_needs (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
 contact_id uuid NOT NULL REFERENCES contacts ON DELETE CASCADE,
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
 notes text NOT NULL DEFAULT '',
 starts_on date NOT NULL,
 ends_on date NOT NULL CHECK (ends_on BETWEEN starts_on AND starts_on + 92),
 weekdays jsonb NOT NULL CHECK (jsonb_typeof(weekdays)='array' AND jsonb_array_length(weekdays) BETWEEN 1 AND 7 AND weekdays <@ '[1,2,3,4,5,6,7]'::jsonb),
 start_time text NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
 arrival_window jsonb,
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX spitex_visit_needs_client ON spitex_visit_needs(tenant_id,contact_id);
ALTER TABLE spitex_visit_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE spitex_visit_needs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON spitex_visit_needs USING (tenant_id=current_tenant_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON spitex_visit_needs TO clinks_app;
ALTER PUBLICATION powersync ADD TABLE spitex_visit_needs;

CREATE FUNCTION generate_spitex_need_visits() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 zone text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.contact_id<>OLD.contact_id OR NEW.tenant_id<>OLD.tenant_id THEN
   RAISE EXCEPTION 'A need belongs to one client' USING ERRCODE='23514';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['revision','updated_at']) = (to_jsonb(OLD) - ARRAY['revision','updated_at']) THEN RETURN NEW; END IF;
  IF NEW.starts_on <= OLD.ends_on THEN
   RAISE EXCEPTION 'Planning periods overlap' USING ERRCODE='23514';
  END IF;
 END IF;
 SELECT time_zone INTO STRICT zone FROM tenants WHERE id=NEW.tenant_id;
 INSERT INTO appointments(id,tenant_id,contact_id,series_id,title,notes,kind,status,starts_at,ends_at,arrival_window)
 SELECT uuidv7(),NEW.tenant_id,NEW.contact_id,NEW.id,NEW.title,NEW.notes,'spitex','planned',
        slot,slot+make_interval(mins=>NEW.duration_minutes),NEW.arrival_window
 FROM generate_series(0,NEW.ends_on-NEW.starts_on) AS offsets(n)
 CROSS JOIN LATERAL (SELECT ((NEW.starts_on+n)+NEW.start_time::time) AT TIME ZONE zone AS slot) AS times
 WHERE NEW.weekdays @> to_jsonb(extract(isodow FROM NEW.starts_on+n)::int);
 IF NOT FOUND THEN RAISE EXCEPTION 'No matching planning day' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER generate_spitex_visits AFTER INSERT OR UPDATE ON spitex_visit_needs
FOR EACH ROW EXECUTE FUNCTION generate_spitex_need_visits();
