CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT,
    email TEXT NOT NULL CHECK (email = lower(email)),
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ROLE_SUPER_ADMIN', 'ROLE_TENANT_ADMIN', 'ROLE_USER')),
    locale VARCHAR(10) NOT NULL DEFAULT 'en-US',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT super_admin_has_no_tenant CHECK (
        (role = 'ROLE_SUPER_ADMIN' AND tenant_id IS NULL)
        OR (role <> 'ROLE_SUPER_ADMIN' AND tenant_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS users_tenant_id_idx ON users (tenant_id);

CREATE TABLE IF NOT EXISTS languages (
    code VARCHAR(10) PRIMARY KEY,
    name TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT language_code_format CHECK (code ~ '^[a-z]{2,3}(-[A-Z]{2})?$')
);

CREATE UNIQUE INDEX IF NOT EXISTS one_default_language
    ON languages ((is_default))
    WHERE is_default;

CREATE TABLE IF NOT EXISTS translations (
    locale VARCHAR(10) NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (locale, key)
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_user_isolation ON users;
CREATE POLICY tenant_user_isolation ON users
    USING (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id::text = current_setting('app.current_tenant', true)
    )
    WITH CHECK (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id::text = current_setting('app.current_tenant', true)
    );

INSERT INTO languages (code, name, is_default, is_active)
VALUES
    ('de-CH', 'Deutsch (Schweiz)', TRUE, TRUE),
    ('en-US', 'English (US)', FALSE, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO translations (locale, key, value)
VALUES
    ('de-CH', 'ui.email', 'E-Mail-Adresse'),
    ('de-CH', 'ui.password', 'Passwort'),
    ('de-CH', 'ui.tenant_name', 'Mandantenname'),
    ('de-CH', 'ui.sign_in', 'Anmelden'),
    ('de-CH', 'ui.register', 'Registrieren'),
    ('de-CH', 'ui.sign_out', 'Abmelden'),
    ('de-CH', 'ui.create_tenant', 'Mandant erstellen'),
    ('de-CH', 'ui.tenants', 'Mandanten'),
    ('de-CH', 'ui.languages', 'Sprachen'),
    ('de-CH', 'ui.translations', 'Übersetzungen'),
    ('de-CH', 'ui.save', 'Speichern'),
    ('de-CH', 'ui.loading', 'Wird geladen …'),
    ('de-CH', 'ui.admin_login', 'Admin-Anmeldung'),
    ('de-CH', 'ui.dashboard', 'Dashboard'),
    ('de-CH', 'ui.no_tenants', 'Noch keine Mandanten vorhanden.'),
    ('de-CH', 'ui.translation_key', 'Übersetzungsschlüssel'),
    ('de-CH', 'ui.translation_value', 'Übersetzungstext'),
    ('de-CH', 'ui.add_translation', 'Übersetzung speichern'),
    ('de-CH', 'error.invalid_credentials', 'E-Mail oder Passwort ist ungültig.'),
    ('de-CH', 'error.unauthorized', 'Für diese Aktion fehlen die erforderlichen Rechte.'),
    ('de-CH', 'error.validation', 'Bitte überprüfe die eingegebenen Daten.'),
    ('de-CH', 'error.email_taken', 'Diese E-Mail-Adresse wird bereits verwendet.'),
    ('de-CH', 'error.tenant_not_found', 'Der Mandant wurde nicht gefunden.'),
    ('de-CH', 'error.internal', 'Ein interner Fehler ist aufgetreten. Bitte versuche es erneut.'),
    ('en-US', 'ui.email', 'Email address'),
    ('en-US', 'ui.password', 'Password'),
    ('en-US', 'ui.tenant_name', 'Tenant name'),
    ('en-US', 'ui.sign_in', 'Sign in'),
    ('en-US', 'ui.register', 'Register'),
    ('en-US', 'ui.sign_out', 'Sign out'),
    ('en-US', 'ui.create_tenant', 'Create tenant'),
    ('en-US', 'ui.tenants', 'Tenants'),
    ('en-US', 'ui.languages', 'Languages'),
    ('en-US', 'ui.translations', 'Translations'),
    ('en-US', 'ui.save', 'Save'),
    ('en-US', 'ui.loading', 'Loading …'),
    ('en-US', 'ui.admin_login', 'Administrator sign in'),
    ('en-US', 'ui.dashboard', 'Dashboard'),
    ('en-US', 'ui.no_tenants', 'No tenants yet.'),
    ('en-US', 'ui.translation_key', 'Translation key'),
    ('en-US', 'ui.translation_value', 'Translation value'),
    ('en-US', 'ui.add_translation', 'Save translation'),
    ('en-US', 'error.invalid_credentials', 'Email or password is invalid.'),
    ('en-US', 'error.unauthorized', 'You do not have permission to perform this action.'),
    ('en-US', 'error.validation', 'Please check the submitted values.'),
    ('en-US', 'error.email_taken', 'This email address is already in use.'),
    ('en-US', 'error.tenant_not_found', 'The tenant was not found.'),
    ('en-US', 'error.internal', 'An internal error occurred. Please try again.')
ON CONFLICT (locale, key) DO NOTHING;
