-- Accounts, tenants and sign-in (phase 2).
--
-- `public` holds what clients may later sync (tenants, users, roles, memberships).
-- `auth` holds secrets and is never replicated: password hashes, TOTP secrets, token hashes.
-- The API connects as a login role that is a member of `clinks_app`; that role does not own the tables,
-- so row-level security applies to every query it runs.

CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'clinks_app') THEN
		CREATE ROLE clinks_app NOLOGIN;
	END IF;
END
$$;

CREATE SCHEMA auth;

-- The scope a transaction runs in, set by the API with set_config(…, true).
CREATE FUNCTION current_tenant_id() RETURNS uuid
	LANGUAGE sql STABLE
	AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE FUNCTION current_user_id() RETURNS uuid
	LANGUAGE sql STABLE
	AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE TABLE tenants (
	id uuid PRIMARY KEY,
	name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
	industry text NOT NULL CHECK (industry IN ('physio', 'spitex', 'services')),
	brand_color text NOT NULL DEFAULT '#0f766e',
	locale text NOT NULL DEFAULT 'de-CH',
	time_zone text NOT NULL DEFAULT 'Europe/Zurich',
	plan text NOT NULL DEFAULT 'starter',
	billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
	trial_ends_at timestamptz,
	enabled_modules text[] NOT NULL DEFAULT '{}',
	feature_flags text[] NOT NULL DEFAULT '{}',
	onboarding_completed boolean NOT NULL DEFAULT false,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
	id uuid PRIMARY KEY,
	email citext NOT NULL UNIQUE,
	first_name text NOT NULL DEFAULT '',
	last_name text NOT NULL DEFAULT '',
	avatar_color text NOT NULL DEFAULT '#0f766e',
	locale text NOT NULL DEFAULT 'de-CH',
	global_role text CHECK (global_role IN ('super_administrator')),
	email_verified_at timestamptz,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	name text NOT NULL,
	kind text NOT NULL CHECK (kind IN ('administrator', 'user', 'custom')),
	permissions text[] NOT NULL DEFAULT '{}',
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (tenant_id, name)
);
CREATE INDEX roles_tenant ON roles (tenant_id);

CREATE TABLE memberships (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
	role_id uuid NOT NULL REFERENCES roles,
	status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
	job_title text NOT NULL DEFAULT '',
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (tenant_id, user_id)
);
CREATE INDEX memberships_user ON memberships (user_id);

CREATE TABLE invitations (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	email citext NOT NULL,
	role_id uuid NOT NULL REFERENCES roles,
	status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
	expires_at timestamptz NOT NULL,
	invited_by uuid NOT NULL REFERENCES users,
	revision integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_tenant ON invitations (tenant_id);

CREATE TABLE audit (
	id uuid PRIMARY KEY,
	tenant_id uuid REFERENCES tenants ON DELETE CASCADE,
	actor_id uuid REFERENCES users ON DELETE SET NULL,
	action text NOT NULL,
	target text NOT NULL DEFAULT '',
	meta jsonb NOT NULL DEFAULT '{}',
	ip text,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_tenant_time ON audit (tenant_id, created_at DESC);

-- Secrets. Only the API reads these; nothing here is ever published to PowerSync.

CREATE TABLE auth.credentials (
	user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
	password_hash text NOT NULL,
	totp_secret bytea,
	totp_enabled_at timestamptz,
	failed_attempts integer NOT NULL DEFAULT 0,
	locked_until timestamptz,
	password_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth.recovery_codes (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
	code_hash bytea NOT NULL,
	used_at timestamptz
);
CREATE INDEX recovery_codes_user ON auth.recovery_codes (user_id);

-- Email verification codes, password reset links and invitation links. Only hashes are stored.
CREATE TABLE auth.one_time_tokens (
	id uuid PRIMARY KEY,
	purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password', 'invitation', 'two_factor')),
	user_id uuid REFERENCES users ON DELETE CASCADE,
	invitation_id uuid REFERENCES invitations ON DELETE CASCADE,
	tenant_id uuid REFERENCES tenants ON DELETE CASCADE,
	token_hash bytea NOT NULL UNIQUE,
	attempts integer NOT NULL DEFAULT 0,
	expires_at timestamptz NOT NULL,
	used_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per refresh token. A family is one signed-in device; rotation adds a row to it.
CREATE TABLE auth.refresh_tokens (
	id uuid PRIMARY KEY,
	family_id uuid NOT NULL,
	user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
	tenant_id uuid REFERENCES tenants ON DELETE SET NULL,
	token_hash bytea NOT NULL UNIQUE,
	device text NOT NULL DEFAULT '',
	ip text,
	expires_at timestamptz NOT NULL,
	replaced_at timestamptz,
	revoked_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family ON auth.refresh_tokens (family_id);
CREATE INDEX refresh_tokens_user ON auth.refresh_tokens (user_id);

-- Row-level security: a second wall behind the API's own checks.
-- FORCE applies the policies to the table owner too, so only superusers bypass them.

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_visible ON tenants FOR SELECT
	USING (id = current_tenant_id() OR id IN (SELECT tenant_id FROM memberships WHERE user_id = current_user_id()));
CREATE POLICY tenant_write ON tenants FOR ALL
	USING (id = current_tenant_id())
	WITH CHECK (id = current_tenant_id());

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY role_visible ON roles FOR SELECT
	USING (tenant_id = current_tenant_id() OR id IN (SELECT role_id FROM memberships WHERE user_id = current_user_id()));
CREATE POLICY role_write ON roles FOR ALL
	USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_visible ON memberships FOR SELECT
	USING (tenant_id = current_tenant_id() OR user_id = current_user_id());
CREATE POLICY membership_write ON memberships FOR ALL
	USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitation_tenant ON invitations FOR ALL
	USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON audit FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY audit_write ON audit FOR INSERT
	WITH CHECK (tenant_id IS NULL OR tenant_id = current_tenant_id());

GRANT USAGE ON SCHEMA public, auth TO clinks_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO clinks_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO clinks_app;
GRANT EXECUTE ON FUNCTION current_tenant_id(), current_user_id() TO clinks_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clinks_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clinks_app;

-- One row that proves replication works end to end (also created by the dev init script).
CREATE TABLE IF NOT EXISTS system_status (
	id text PRIMARY KEY,
	message text NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO system_status (id, message) VALUES ('dev', 'PowerSync replication is running') ON CONFLICT DO NOTHING;
GRANT SELECT ON system_status TO clinks_app;

-- PowerSync replicates only what is listed here, never the auth schema. Later phases add their tables.
DROP PUBLICATION IF EXISTS powersync;
CREATE PUBLICATION powersync FOR TABLE system_status, tenants, users, roles, memberships;
