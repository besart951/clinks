-- Mail plan phase 1: every mail of a workspace goes through an outbox written in the transaction that causes it, and
-- a worker in the API sends it, with retries. Sign-in codes and invitations stay direct (no workspace, need speed).

CREATE TABLE mail_outbox (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN ('invoice', 'reminder', 'appointment', 'personal', 'campaign', 'optin', 'system')),
	from_name text NOT NULL,
	reply_to text,
	recipient text NOT NULL,
	subject text NOT NULL,
	text_body text NOT NULL,
	html_body text NOT NULL,
	-- [{ documentId, filename, sha256? }]: read from the documents when sending, checked against sha256 when given.
	attachments jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attachments) = 'array'),
	headers jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(headers) = 'object'),
	contact_id uuid REFERENCES contacts ON DELETE SET NULL,
	status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'bounced', 'failed', 'suppressed')),
	attempts integer NOT NULL DEFAULT 0,
	error text,
	message_id text,
	created_at timestamptz NOT NULL DEFAULT now(),
	sent_at timestamptz
);
CREATE INDEX mail_outbox_tenant ON mail_outbox (tenant_id, created_at);
ALTER TABLE mail_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON mail_outbox USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

-- What the worker still has to send, across workspaces. In the auth schema: never published, and the worker reads it
-- before it knows the workspace; the mail itself it reads in that workspace's scope.
CREATE TABLE auth.mail_queue (
	outbox_id uuid PRIMARY KEY REFERENCES mail_outbox ON DELETE CASCADE,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	due_at timestamptz NOT NULL DEFAULT now(),
	locked_until timestamptz
);
CREATE INDEX mail_queue_due ON auth.mail_queue (due_at);

-- The invoice send log shows the delivery of its mail.
ALTER TABLE invoice_sends ADD COLUMN outbox_id uuid REFERENCES mail_outbox ON DELETE SET NULL;
