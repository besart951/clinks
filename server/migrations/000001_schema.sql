CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
    SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid
$$;

CREATE FUNCTION app_bypasses_rls() RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
    SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'true'
$$;

CREATE TABLE languages (
    code text PRIMARY KEY,
    name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
    is_default boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT languages_code_format CHECK (code ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

CREATE UNIQUE INDEX languages_single_default
    ON languages (is_default) WHERE is_default;
CREATE INDEX languages_name_code_idx ON languages (name, code);
CREATE INDEX languages_name_trgm_idx ON languages USING gin (name gin_trgm_ops);

CREATE TABLE tenants (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tenants_name_id_idx ON tenants (name, id);
CREATE INDEX tenants_created_id_idx ON tenants (created_at, id);
CREATE INDEX tenants_name_trgm_idx ON tenants USING gin (name gin_trgm_ops);

CREATE TABLE users (
    id uuid PRIMARY KEY,
    email text NOT NULL,
    password_hash text,
    global_role text NOT NULL DEFAULT 'user'
        CHECK (global_role IN ('user', 'super_administrator')),
    locale text NOT NULL REFERENCES languages(code),
    session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)))
);

CREATE INDEX users_email_id_idx ON users (email, id);
CREATE INDEX users_created_id_idx ON users (created_at, id);
CREATE INDEX users_email_trgm_idx ON users USING gin (email gin_trgm_ops);
CREATE INDEX users_global_role_email_id_idx ON users (global_role, email, id);

CREATE TABLE tenant_roles (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
    kind text NOT NULL CHECK (kind IN ('administrator', 'user', 'custom')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (id, tenant_id)
);

CREATE UNIQUE INDEX tenant_roles_name_unique
    ON tenant_roles (tenant_id, lower(name));
CREATE UNIQUE INDEX tenant_roles_protected_kind_unique
    ON tenant_roles (tenant_id, kind) WHERE kind <> 'custom';
CREATE INDEX tenant_roles_name_id_idx
    ON tenant_roles (tenant_id, name, id);
CREATE INDEX tenant_roles_created_id_idx
    ON tenant_roles (tenant_id, created_at, id);
CREATE INDEX tenant_roles_name_trgm_idx
    ON tenant_roles USING gin (name gin_trgm_ops);

CREATE TABLE tenant_role_permissions (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    role_id uuid NOT NULL,
    permission text NOT NULL CHECK (permission IN (
        'tenant.read', 'tenant.manage',
        'user.read', 'user.manage',
        'project.read', 'project.create', 'project.edit', 'project.delete',
        'role.read', 'role.manage'
    )),
    PRIMARY KEY (role_id, permission),
    FOREIGN KEY (role_id, tenant_id)
        REFERENCES tenant_roles(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX tenant_role_permissions_tenant_idx
    ON tenant_role_permissions (tenant_id, permission, role_id);

CREATE TABLE tenant_memberships (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    user_id uuid NOT NULL REFERENCES users(id),
    role_id uuid NOT NULL,
    status text NOT NULL CHECK (status IN ('active', 'inactive')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, user_id),
    FOREIGN KEY (role_id, tenant_id)
        REFERENCES tenant_roles(id, tenant_id)
);

CREATE INDEX tenant_memberships_user_status_idx
    ON tenant_memberships (user_id, status, tenant_id, id);
CREATE INDEX tenant_memberships_tenant_status_idx
    ON tenant_memberships (tenant_id, status, user_id, id);
CREATE INDEX tenant_memberships_tenant_created_idx
    ON tenant_memberships (tenant_id, created_at, id);
CREATE INDEX tenant_memberships_role_status_idx
    ON tenant_memberships (tenant_id, role_id, status);

CREATE TABLE invitations (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    email text NOT NULL CHECK (email = lower(btrim(email))),
    role_id uuid NOT NULL,
    token_hash text UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    revoked_at timestamptz,
    created_by uuid NOT NULL REFERENCES users(id),
    delivery_status text NOT NULL DEFAULT 'queued'
        CHECK (delivery_status IN ('queued', 'retrying', 'sent', 'failed')),
    delivery_locale text NOT NULL REFERENCES languages(code),
    anonymized_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (role_id, tenant_id)
        REFERENCES tenant_roles(id, tenant_id)
);

CREATE INDEX invitations_tenant_created_idx
    ON invitations (tenant_id, created_at DESC, id DESC);
CREATE INDEX invitations_created_idx
    ON invitations (created_at, id);
CREATE INDEX invitations_email_created_idx
    ON invitations (email, created_at DESC, id DESC);
CREATE INDEX invitations_email_id_idx
    ON invitations (email, id);
CREATE INDEX invitations_tenant_email_idx
    ON invitations (tenant_id, email, id);
CREATE INDEX invitations_tenant_expires_idx
    ON invitations (tenant_id, expires_at, id);
CREATE INDEX invitations_expires_id_idx
    ON invitations (expires_at, id);
CREATE INDEX invitations_email_trgm_idx
    ON invitations USING gin (email gin_trgm_ops);
CREATE INDEX invitations_pending_idx
    ON invitations (expires_at, id)
    WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE external_identities (
    issuer text NOT NULL,
    subject text NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id),
    email text NOT NULL CHECK (email = lower(btrim(email))),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (issuer, subject),
    UNIQUE (issuer, user_id)
);

CREATE TABLE outbox_jobs (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    kind text NOT NULL CHECK (kind = 'invitation.email'),
    invitation_id uuid NOT NULL REFERENCES invitations(id),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'dead_letter')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    locked_at timestamptz,
    lease_token uuid,
    completed_at timestamptz,
    dead_lettered_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT outbox_processing_lease CHECK (
        (status = 'processing') = (locked_at IS NOT NULL AND lease_token IS NOT NULL)
    )
);

CREATE INDEX outbox_jobs_claim_idx
    ON outbox_jobs (status, available_at, created_at, id);

CREATE TABLE translation_overrides (
    locale text NOT NULL REFERENCES languages(code),
    application_scope text NOT NULL
        CHECK (application_scope IN ('shared', 'admin', 'planer_link', 'infra_link')),
    key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 255),
    value text NOT NULL CHECK (octet_length(value) <= 16384),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (locale, application_scope, key)
);

CREATE INDEX translation_overrides_key_trgm_idx
    ON translation_overrides USING gin (key gin_trgm_ops);
CREATE INDEX translation_overrides_key_order_idx
    ON translation_overrides (key, locale, application_scope);
CREATE INDEX translation_overrides_updated_order_idx
    ON translation_overrides (updated_at, locale, application_scope, key);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor_id uuid REFERENCES users(id),
    tenant_id uuid REFERENCES tenants(id),
    action text NOT NULL,
    target text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_events_occurred_id_idx
    ON audit_events (occurred_at DESC, id DESC);
CREATE INDEX audit_events_tenant_occurred_idx
    ON audit_events (tenant_id, occurred_at DESC, id DESC);
CREATE INDEX audit_events_actor_occurred_idx
    ON audit_events (actor_id, occurred_at DESC, id DESC);
CREATE INDEX audit_events_action_occurred_idx
    ON audit_events (action, occurred_at DESC, id DESC);
CREATE INDEX audit_events_target_trgm_idx
    ON audit_events USING gin (target gin_trgm_ops);

CREATE FUNCTION reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit events are immutable';
END;
$$;

CREATE TRIGGER audit_events_immutable
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_isolation ON tenants
    USING (app_bypasses_rls() OR id = app_current_tenant())
    WITH CHECK (app_bypasses_rls() OR id = app_current_tenant());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_isolation ON users
    USING (
        app_bypasses_rls()
        OR EXISTS (
            SELECT 1 FROM tenant_memberships membership
            WHERE membership.user_id = users.id
              AND membership.tenant_id = app_current_tenant()
        )
    );

ALTER TABLE tenant_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_roles_isolation ON tenant_roles
    USING (app_bypasses_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypasses_rls() OR tenant_id = app_current_tenant());

ALTER TABLE tenant_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_role_permissions_isolation ON tenant_role_permissions
    USING (app_bypasses_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypasses_rls() OR tenant_id = app_current_tenant());

ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_memberships_isolation ON tenant_memberships
    USING (app_bypasses_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypasses_rls() OR tenant_id = app_current_tenant());

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_isolation ON invitations
    USING (app_bypasses_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypasses_rls() OR tenant_id = app_current_tenant());

ALTER TABLE external_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_identities FORCE ROW LEVEL SECURITY;
CREATE POLICY external_identities_system_only ON external_identities
    USING (app_bypasses_rls()) WITH CHECK (app_bypasses_rls());

ALTER TABLE outbox_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_jobs_isolation ON outbox_jobs
    USING (app_bypasses_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypasses_rls() OR tenant_id = app_current_tenant());

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_isolation ON audit_events
    USING (app_bypasses_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypasses_rls() OR tenant_id = app_current_tenant());
