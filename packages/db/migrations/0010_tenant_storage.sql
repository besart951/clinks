-- A tenant's own S3 bucket. Each save adds a row and marks it active; older rows stay, because document
-- versions stored there keep pointing at them. Lives in the auth schema: PowerSync never publishes it.
CREATE TABLE auth.storage_configs (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	provider text NOT NULL CHECK (provider IN ('infomaniak', 'cloudflare', 'custom')),
	-- https in production; the API only lets http://localhost through in development.
	endpoint text NOT NULL CHECK (endpoint ~ '^https?://'),
	region text NOT NULL,
	bucket text NOT NULL,
	access_key_id text NOT NULL,
	-- AES-256-GCM with STORAGE_SECRET_KEY, bound to the tenant; never leaves the API in clear text.
	secret_ciphertext text NOT NULL,
	secret_hint text NOT NULL,
	path_style boolean NOT NULL,
	location_acknowledged_at timestamptz,
	active boolean NOT NULL DEFAULT true,
	last_check_at timestamptz,
	last_check_ok boolean,
	created_by uuid NOT NULL REFERENCES users,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX storage_configs_active ON auth.storage_configs (tenant_id) WHERE active;
ALTER TABLE auth.storage_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.storage_configs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON auth.storage_configs USING (tenant_id = current_tenant_id());
-- Rows are deactivated, never removed, while document versions may still live in that bucket.
REVOKE DELETE ON auth.storage_configs FROM clinks_app;

-- Where a version's bytes live: null means CLinks storage.
ALTER TABLE document_versions ADD COLUMN storage_id uuid REFERENCES auth.storage_configs;
