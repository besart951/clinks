-- Contacts and appointments (phase 3): the first tables clients sync through PowerSync.
-- Columns follow packages/sync-schema/src/tables.ts; a test compares the two.

CREATE TABLE contacts (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN ('person', 'company')),
	first_name text NOT NULL DEFAULT '',
	last_name text NOT NULL DEFAULT '',
	company_name text NOT NULL DEFAULT '',
	email text NOT NULL DEFAULT '',
	phone text NOT NULL DEFAULT '',
	address jsonb NOT NULL DEFAULT '{"street":"","zip":"","city":""}',
	birth_date date,
	insurer text NOT NULL DEFAULT '',
	tags jsonb NOT NULL DEFAULT '[]',
	notes text NOT NULL DEFAULT '',
	archived boolean NOT NULL DEFAULT false,
	ahv_number text,
	insurance_number text,
	language text,
	billing_mode text,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_tenant ON contacts (tenant_id);

CREATE TABLE appointments (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	title text NOT NULL,
	kind text NOT NULL,
	status text NOT NULL,
	contact_id uuid REFERENCES contacts ON DELETE SET NULL,
	assignee_id uuid REFERENCES users ON DELETE SET NULL,
	starts_at timestamptz NOT NULL,
	ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
	location text NOT NULL DEFAULT '',
	notes text NOT NULL DEFAULT '',
	series_id uuid,
	service text,
	arrival_window jsonb,
	billed_invoice_id uuid,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointments_tenant_start ON appointments (tenant_id, starts_at);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY contact_tenant ON contacts FOR ALL
	USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY appointment_tenant ON appointments FOR ALL
	USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON contacts, appointments TO clinks_app;

ALTER PUBLICATION powersync ADD TABLE contacts, appointments;
