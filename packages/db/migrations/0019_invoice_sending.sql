-- Invoicing phase 3: invoices and reminders sent by e-mail, as an attachment or a secure link. The log keeps when,
-- to whom and which way; link openings are counted, nothing else is tracked.

CREATE TABLE invoice_sends (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	invoice_id uuid NOT NULL REFERENCES invoices ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN ('invoice', 'reminder')),
	level integer CHECK (level BETWEEN 1 AND 3),
	document_id uuid NOT NULL REFERENCES documents,
	recipient text NOT NULL,
	method text NOT NULL CHECK (method IN ('attachment', 'link')),
	sent_at timestamptz NOT NULL,
	sent_by uuid REFERENCES users ON DELETE SET NULL,
	link_expires_at timestamptz,
	opened_at timestamptz,
	open_count integer NOT NULL DEFAULT 0,
	CHECK ((method = 'link') = (link_expires_at IS NOT NULL)),
	CHECK ((kind = 'reminder') = (level IS NOT NULL))
);
CREATE INDEX invoice_sends_invoice ON invoice_sends (tenant_id, invoice_id, sent_at);
ALTER TABLE invoice_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_sends FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON invoice_sends USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

-- The secure link's token: only its hash, like every other one-time link. Wrong postcodes count as attempts.
ALTER TABLE auth.one_time_tokens DROP CONSTRAINT one_time_tokens_purpose_check;
ALTER TABLE auth.one_time_tokens ADD CONSTRAINT one_time_tokens_purpose_check
	CHECK (purpose IN ('verify_email', 'reset_password', 'invitation', 'two_factor', 'invoice_link'));
ALTER TABLE auth.one_time_tokens ADD COLUMN invoice_send_id uuid REFERENCES invoice_sends ON DELETE CASCADE;
