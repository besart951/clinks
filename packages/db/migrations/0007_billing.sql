CREATE TABLE billing_accounts (
	tenant_id uuid PRIMARY KEY REFERENCES tenants ON DELETE CASCADE,
	customer_id text NOT NULL UNIQUE,
	status text NOT NULL DEFAULT 'new'
);
CREATE TABLE billing_events (
	id text PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON billing_accounts USING (tenant_id = current_tenant_id());
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON billing_events USING (tenant_id = current_tenant_id());
