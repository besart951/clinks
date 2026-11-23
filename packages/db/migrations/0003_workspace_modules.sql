CREATE TABLE folders (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	name text NOT NULL,
	parent_id uuid REFERENCES folders ON DELETE SET NULL,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	name text NOT NULL,
	folder_id uuid REFERENCES folders ON DELETE SET NULL,
	mime_type text NOT NULL,
	size integer NOT NULL,
	data_url text NOT NULL,
	targets jsonb NOT NULL,
	uploaded_by uuid NOT NULL REFERENCES users,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	number text NOT NULL,
	kind text NOT NULL,
	contact_id uuid NOT NULL REFERENCES contacts,
	issue_date date NOT NULL,
	due_date date NOT NULL,
	status text NOT NULL,
	lines jsonb NOT NULL,
	payments jsonb NOT NULL,
	reminder_level integer NOT NULL,
	notes text NOT NULL,
	appointment_ids jsonb NOT NULL,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expenses (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	date date NOT NULL,
	description text NOT NULL,
	supplier text NOT NULL,
	category text NOT NULL,
	amount integer NOT NULL,
	vat_rate integer NOT NULL,
	receipt_id uuid REFERENCES documents ON DELETE SET NULL,
	status text NOT NULL,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	title text NOT NULL,
	description text NOT NULL,
	status text NOT NULL,
	priority text NOT NULL,
	assignee_ids jsonb NOT NULL,
	due_date date,
	labels jsonb NOT NULL,
	sort_order integer NOT NULL,
	contact_id uuid REFERENCES contacts ON DELETE SET NULL,
	checklist jsonb NOT NULL,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contact_comments (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	target jsonb NOT NULL,
	author_id uuid NOT NULL REFERENCES users,
	body text NOT NULL,
	mentions jsonb NOT NULL,
	CHECK (target->>'kind' = 'contact'),
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task_comments (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	target jsonb NOT NULL,
	author_id uuid NOT NULL REFERENCES users,
	body text NOT NULL,
	mentions jsonb NOT NULL,
	CHECK (target->>'kind' = 'task'),
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoice_comments (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	target jsonb NOT NULL,
	author_id uuid NOT NULL REFERENCES users,
	body text NOT NULL,
	mentions jsonb NOT NULL,
	CHECK (target->>'kind' = 'invoice'),
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mails (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	folder text NOT NULL,
	sender text NOT NULL,
	from_name text NOT NULL,
	recipients jsonb NOT NULL,
	subject text NOT NULL,
	body text NOT NULL,
	sent_at timestamptz NOT NULL,
	is_read boolean NOT NULL,
	starred boolean NOT NULL,
	contact_id uuid REFERENCES contacts ON DELETE SET NULL,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE templates (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	name text NOT NULL,
	subject text NOT NULL,
	body text NOT NULL,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaigns (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	name text NOT NULL,
	subject text NOT NULL,
	preview_text text NOT NULL,
	body text NOT NULL,
	audience_tag text NOT NULL,
	status text NOT NULL,
	scheduled_at timestamptz,
	sent_at timestamptz,
	approved_by uuid REFERENCES users ON DELETE SET NULL,
	stats jsonb NOT NULL,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prescriptions (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	contact_id uuid NOT NULL REFERENCES contacts,
	doctor text NOT NULL,
	diagnosis text NOT NULL,
	tariff text NOT NULL,
	sessions_prescribed integer NOT NULL,
	issued_on date NOT NULL,
	valid_until date NOT NULL,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE physio_notes (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	kind text NOT NULL,
	contact_id uuid NOT NULL REFERENCES contacts,
	appointment_id uuid REFERENCES appointments ON DELETE SET NULL,
	date date NOT NULL,
	author_id uuid NOT NULL REFERENCES users,
	subjective text NOT NULL,
	objective text NOT NULL,
	assessment text NOT NULL,
	plan text NOT NULL,
	CHECK (kind = 'physio'),
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE spitex_notes (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	kind text NOT NULL,
	contact_id uuid NOT NULL REFERENCES contacts,
	appointment_id uuid REFERENCES appointments ON DELETE SET NULL,
	date date NOT NULL,
	author_id uuid NOT NULL REFERENCES users,
	subjective text NOT NULL,
	objective text NOT NULL,
	assessment text NOT NULL,
	plan text NOT NULL,
	CHECK (kind = 'spitex'),
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE time_entries (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES users,
	appointment_id uuid REFERENCES appointments ON DELETE SET NULL,
	date date NOT NULL,
	minutes integer NOT NULL,
	description text NOT NULL,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES users,
	kind text NOT NULL,
	message jsonb NOT NULL,
	href text NOT NULL,
	is_read boolean NOT NULL,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Apply the same tenant boundary to every new module table.
DO $$
DECLARE
    module_table text;
BEGIN
    FOREACH module_table IN ARRAY ARRAY['folders', 'documents', 'invoices', 'expenses', 'tasks', 'contact_comments', 'task_comments', 'invoice_comments', 'mails', 'templates', 'campaigns', 'prescriptions', 'physio_notes', 'spitex_notes', 'time_entries', 'notifications'] LOOP
        EXECUTE format('CREATE INDEX ON %I (tenant_id)', module_table);
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', module_table);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', module_table);
        EXECUTE format('CREATE POLICY tenant_scope ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())', module_table);
    END LOOP;
END $$;

-- A sender can create a notification. Only its recipient can read or change it.
CREATE POLICY personal_read ON notifications AS RESTRICTIVE FOR SELECT USING (user_id = current_user_id());
CREATE POLICY personal_update ON notifications AS RESTRICTIVE FOR UPDATE USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());
CREATE POLICY personal_delete ON notifications AS RESTRICTIVE FOR DELETE USING (user_id = current_user_id());

ALTER PUBLICATION powersync ADD TABLE folders, documents, invoices, expenses, tasks, contact_comments, task_comments, invoice_comments, mails, templates, campaigns, prescriptions, physio_notes, spitex_notes, time_entries, notifications;
ALTER PUBLICATION powersync ADD TABLE audit (id, tenant_id, actor_id, action, target, created_at);
