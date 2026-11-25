-- Releasing the Spitex plan (per tenant and week). While a week is not released, its visits are drafts: only
-- planners (spitex.read) see them. A release shows every staff member their own visits of that week.

CREATE TABLE spitex_week_releases (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	-- The Monday of the week, in the tenant's time zone.
	week_start date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
	released_by uuid NOT NULL REFERENCES users,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (tenant_id, week_start)
);
ALTER TABLE spitex_week_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE spitex_week_releases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON spitex_week_releases USING (tenant_id = current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON spitex_week_releases TO clinks_app;
ALTER PUBLICATION powersync ADD TABLE spitex_week_releases;

-- Whether a visit's week is released. Kept on the row so that sync streams and the policy below stay simple
-- lookups; only the triggers set it, whatever a client sends.
ALTER TABLE appointments ADD COLUMN published boolean NOT NULL DEFAULT false;

CREATE FUNCTION visit_week(tenant uuid, starts timestamptz) RETURNS date
LANGUAGE sql STABLE AS $$
	SELECT date_trunc('week', starts AT TIME ZONE t.time_zone)::date FROM tenants t WHERE t.id = tenant
$$;

CREATE FUNCTION set_visit_published() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	NEW.published := NEW.kind = 'spitex' AND EXISTS (
		SELECT 1 FROM spitex_week_releases r
		WHERE r.tenant_id = NEW.tenant_id AND r.week_start = visit_week(NEW.tenant_id, NEW.starts_at)
	);
	RETURN NEW;
END $$;
CREATE TRIGGER visit_published BEFORE INSERT OR UPDATE OF starts_at, kind, published ON appointments
	FOR EACH ROW EXECUTE FUNCTION set_visit_published();

-- Giving or withdrawing a release touches the week's visits; the trigger above then sets the flag.
CREATE FUNCTION publish_week_visits() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	release spitex_week_releases := COALESCE(NEW, OLD);
	zone text := (SELECT time_zone FROM tenants WHERE id = release.tenant_id);
BEGIN
	UPDATE appointments SET published = (TG_OP = 'INSERT')
	WHERE tenant_id = release.tenant_id AND kind = 'spitex'
		AND starts_at >= release.week_start::timestamp AT TIME ZONE zone
		AND starts_at < (release.week_start + 7)::timestamp AT TIME ZONE zone;
	RETURN NULL;
END $$;
CREATE TRIGGER publish_week AFTER INSERT OR DELETE ON spitex_week_releases
	FOR EACH ROW EXECUTE FUNCTION publish_week_visits();

-- Spitex visits are no longer visible to the whole tenant: planners see all of them, staff their own
-- released ones. Jobs without a user (app.user_id empty) keep the tenant-wide view.
DROP POLICY appointment_tenant ON appointments;
CREATE POLICY appointment_tenant ON appointments FOR ALL
	USING (
		tenant_id = current_tenant_id()
		AND (
			kind <> 'spitex'
			OR current_user_id() IS NULL
			OR EXISTS (
				SELECT 1 FROM sync_access s
				WHERE s.tenant_id = appointments.tenant_id AND s.user_id = current_user_id()
					AND (
						'spitex.read' = ANY (s.read_permissions)
						OR (
							appointments.published
							AND appointments.assignee_id = current_user_id()
							AND 'spitex.own.read' = ANY (s.read_permissions)
						)
					)
			)
		)
	)
	WITH CHECK (tenant_id = current_tenant_id());

-- The two new permissions for the protected roles: administrators release, both see their own visits.
-- Every tenant's rows: the owner steps outside the forced policies for this transaction only.
ALTER TABLE roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships NO FORCE ROW LEVEL SECURITY;
ALTER TABLE tenants NO FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_access NO FORCE ROW LEVEL SECURITY;
UPDATE roles SET permissions = permissions || ARRAY['spitex.own.read', 'spitex.release']
	WHERE kind = 'administrator' AND NOT permissions @> ARRAY['spitex.release'];
UPDATE roles SET permissions = permissions || ARRAY['spitex.own.read']
	WHERE kind = 'user' AND NOT permissions @> ARRAY['spitex.own.read'];
INSERT INTO sync_access SELECT * FROM membership_sync_permissions
	ON CONFLICT (id) DO UPDATE SET read_permissions = EXCLUDED.read_permissions;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_access FORCE ROW LEVEL SECURITY;
