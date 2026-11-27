-- «Teilen-Link»: someone without an account downloads one file until a date. The token lives in
-- auth.one_time_tokens (looked up by its hash); this table is what the workspace sees and can revoke.
CREATE TABLE document_shares (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	document_id uuid NOT NULL REFERENCES documents ON DELETE CASCADE,
	created_by uuid REFERENCES users ON DELETE SET NULL,
	expires_at timestamptz NOT NULL,
	revoked_at timestamptz,
	open_count integer NOT NULL DEFAULT 0,
	opened_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_shares_document ON document_shares (tenant_id, document_id);
ALTER TABLE document_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_shares FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON document_shares USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE auth.one_time_tokens DROP CONSTRAINT one_time_tokens_purpose_check;
ALTER TABLE auth.one_time_tokens ADD CONSTRAINT one_time_tokens_purpose_check
	CHECK (purpose IN ('verify_email', 'reset_password', 'invitation', 'two_factor', 'invoice_link', 'newsletter_optin',
		'document_share'));
ALTER TABLE auth.one_time_tokens ADD COLUMN document_share_id uuid REFERENCES document_shares ON DELETE CASCADE;
