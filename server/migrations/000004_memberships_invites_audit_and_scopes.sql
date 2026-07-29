-- Global identities are retained in users. The legacy tenant_id and role columns
-- remain for one release only so a rollback can still read the original shape.
ALTER TABLE users DROP CONSTRAINT IF EXISTS super_admin_has_no_tenant;

CREATE TABLE tenant_memberships (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role TEXT NOT NULL CHECK (role IN ('ROLE_TENANT_ADMIN', 'ROLE_USER')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, user_id)
);

INSERT INTO tenant_memberships (id, tenant_id, user_id, role, status)
SELECT uuidv7(), tenant_id, id,
    CASE WHEN role = 'ROLE_TENANT_ADMIN' THEN 'ROLE_TENANT_ADMIN' ELSE 'ROLE_USER' END,
    'ACTIVE'
FROM users
WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id, user_id) DO NOTHING;

ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_memberships_tenant_isolation ON tenant_memberships
    USING (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

CREATE TABLE invitations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ROLE_TENANT_ADMIN', 'ROLE_USER')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invitations_pending_lookup_idx ON invitations (token_hash) WHERE used_at IS NULL;

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_tenant_isolation ON invitations
    USING (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

ALTER TABLE translations ADD COLUMN application_scope TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE translations DROP CONSTRAINT translations_pkey;
ALTER TABLE translations ADD PRIMARY KEY (locale, application_scope, key);
ALTER TABLE translations ADD CONSTRAINT translations_scope_check
    CHECK (application_scope IN ('shared', 'admin', 'planer_link', 'infra_link'));

CREATE TABLE audit_events (
    id UUID PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_events_occurred_at_idx ON audit_events (occurred_at DESC, id DESC);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_id, occurred_at DESC);
CREATE INDEX audit_events_tenant_idx ON audit_events (tenant_id, occurred_at DESC);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_system_only ON audit_events
    USING (current_setting('app.bypass_rls', true) = 'true')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

CREATE FUNCTION reject_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit events are append-only';
END;
$$;

CREATE TRIGGER audit_events_immutable
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();

INSERT INTO translations (locale, application_scope, key, value) VALUES
    ('de-CH', 'shared', 'error.membership_not_found', 'Die Mitgliedschaft wurde nicht gefunden.'),
    ('de-CH', 'shared', 'error.invitation_invalid', 'Die Einladung ist ungültig.'),
    ('de-CH', 'shared', 'error.invitation_expired', 'Die Einladung ist abgelaufen.'),
    ('de-CH', 'shared', 'error.invitation_used', 'Die Einladung wurde bereits verwendet.'),
    ('de-CH', 'shared', 'error.invite_email_mismatch', 'Diese Einladung gehört zu einer anderen E-Mail-Adresse.'),
	('de-CH', 'shared', 'ui.active_tenant', 'Aktiver Mandant'),
	('de-CH', 'shared', 'ui.invite_user', 'Benutzer einladen'),
	('de-CH', 'shared', 'ui.invitation_link', 'Einladungslink'),
	('de-CH', 'shared', 'ui.copy', 'Kopieren'),
    ('en-US', 'shared', 'error.membership_not_found', 'The membership was not found.'),
    ('en-US', 'shared', 'error.invitation_invalid', 'The invitation is invalid.'),
    ('en-US', 'shared', 'error.invitation_expired', 'The invitation has expired.'),
    ('en-US', 'shared', 'error.invitation_used', 'The invitation has already been used.'),
    ('en-US', 'shared', 'error.invite_email_mismatch', 'This invitation belongs to a different email address.'),
	('en-US', 'shared', 'ui.active_tenant', 'Active tenant'),
	('en-US', 'shared', 'ui.invite_user', 'Invite user'),
	('en-US', 'shared', 'ui.invitation_link', 'Invitation link'),
	('en-US', 'shared', 'ui.copy', 'Copy'),
    ('de-CH', 'shared', 'audit.session.login', 'Anmeldung erfolgreich: {target}'),
    ('de-CH', 'shared', 'audit.session.logout', 'Abmeldung: {target}'),
    ('de-CH', 'shared', 'audit.tenant.switch', 'Mandant gewechselt: {target}'),
    ('de-CH', 'shared', 'audit.tenant.created', 'Mandant erstellt: {target}'),
    ('de-CH', 'shared', 'audit.tenant.registered', 'Mandant registriert: {target}'),
    ('de-CH', 'shared', 'audit.invitation.created', 'Einladung erstellt: {target}'),
    ('de-CH', 'shared', 'audit.invitation.accepted', 'Einladung angenommen: {target}'),
    ('de-CH', 'shared', 'audit.localization.language_saved', 'Sprache geändert: {target}'),
    ('de-CH', 'shared', 'audit.localization.translation_saved', 'Übersetzung geändert: {target}'),
    ('en-US', 'shared', 'audit.session.login', 'Successful sign-in: {target}'),
    ('en-US', 'shared', 'audit.session.logout', 'Sign-out: {target}'),
    ('en-US', 'shared', 'audit.tenant.switch', 'Tenant switched: {target}'),
    ('en-US', 'shared', 'audit.tenant.created', 'Tenant created: {target}'),
    ('en-US', 'shared', 'audit.tenant.registered', 'Tenant registered: {target}'),
    ('en-US', 'shared', 'audit.invitation.created', 'Invitation created: {target}'),
    ('en-US', 'shared', 'audit.invitation.accepted', 'Invitation accepted: {target}'),
    ('en-US', 'shared', 'audit.localization.language_saved', 'Language changed: {target}'),
    ('en-US', 'shared', 'audit.localization.translation_saved', 'Translation changed: {target}')
ON CONFLICT (locale, application_scope, key) DO NOTHING;
