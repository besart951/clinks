-- Document history survives a removed document so that undo can reattach its original version.
CREATE TABLE document_versions (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	document_id uuid NOT NULL,
	object_key text NOT NULL,
	object_version text NOT NULL,
	size integer NOT NULL CHECK (size BETWEEN 0 AND 1000000),
	mime_type text NOT NULL,
	author_id uuid NOT NULL REFERENCES users,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON document_versions (tenant_id, document_id, created_at DESC);
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON document_versions USING (tenant_id = current_tenant_id());
REVOKE UPDATE, DELETE ON document_versions FROM clinks_app;
