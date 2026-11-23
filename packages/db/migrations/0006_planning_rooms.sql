CREATE TABLE planning_rooms (
	tenant_id uuid PRIMARY KEY REFERENCES tenants ON DELETE CASCADE,
	state bytea NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE planning_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_rooms FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON planning_rooms USING (tenant_id = current_tenant_id());
