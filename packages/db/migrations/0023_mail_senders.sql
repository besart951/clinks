-- Mail plan phase 2: a workspace verifies its own domains (SPF, DKIM, DMARC) and sends from its own addresses.
-- CLinks holds one DKIM key per domain and signs itself, so the relay provider can be swapped.

CREATE TABLE mail_domains (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	domain text NOT NULL CHECK (domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'),
	-- Newsletters get a domain of their own (usually a subdomain), so complaints do not hurt business mail.
	purpose text NOT NULL CHECK (purpose IN ('business', 'newsletter')),
	selector text NOT NULL,
	dkim_public_key text NOT NULL,
	status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failing')),
	-- The last check per record: [{ record, ok, found }].
	checks jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(checks) = 'array'),
	checked_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (tenant_id, domain)
);
ALTER TABLE mail_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_domains FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON mail_domains USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

-- The private half, encrypted with STORAGE_SECRET_KEY like tenants' S3 secrets; never synced, never exported.
CREATE TABLE auth.mail_domain_keys (
	domain_id uuid PRIMARY KEY REFERENCES mail_domains ON DELETE CASCADE,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	private_key_ciphertext text NOT NULL
);
ALTER TABLE auth.mail_domain_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.mail_domain_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON auth.mail_domain_keys USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

CREATE TABLE mail_senders (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	domain_id uuid NOT NULL REFERENCES mail_domains ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN ('business', 'personal', 'newsletter')),
	address text NOT NULL CHECK (address ~ '^[^@\s]+@[^@\s]+$'),
	display_name text NOT NULL,
	reply_to text,
	user_id uuid REFERENCES users ON DELETE CASCADE,
	signature text NOT NULL DEFAULT '',
	is_default boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now(),
	CHECK ((kind = 'personal') = (user_id IS NOT NULL)),
	UNIQUE (tenant_id, address)
);
-- One default business sender and one default newsletter sender per workspace.
CREATE UNIQUE INDEX mail_senders_default ON mail_senders (tenant_id, kind) WHERE is_default AND kind <> 'personal';
ALTER TABLE mail_senders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_senders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON mail_senders USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE mail_outbox ADD COLUMN sender_id uuid REFERENCES mail_senders ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN mail_signature text NOT NULL DEFAULT '' CHECK (length(mail_signature) <= 1000);
