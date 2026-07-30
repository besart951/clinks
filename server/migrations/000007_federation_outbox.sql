ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE invitations ADD COLUMN anonymized_at TIMESTAMPTZ;

CREATE TABLE external_identities (
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (issuer, subject),
    CONSTRAINT external_identities_user_issuer_unique UNIQUE (user_id, issuer)
);

ALTER TABLE external_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_identities FORCE ROW LEVEL SECURITY;
CREATE POLICY external_identity_system_only ON external_identities
    USING (current_setting('app.bypass_rls', true) = 'true')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

CREATE TABLE outbox_jobs (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    invitation_id UUID REFERENCES invitations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'dead_letter')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    dead_lettered_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT outbox_jobs_idempotency UNIQUE (kind, invitation_id)
);

CREATE INDEX outbox_jobs_available_idx ON outbox_jobs (status, available_at)
    WHERE status IN ('pending', 'processing');

ALTER TABLE outbox_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_job_isolation ON outbox_jobs
    USING (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id::text = current_setting('app.current_tenant', true)
    )
    WITH CHECK (
        current_setting('app.bypass_rls', true) = 'true'
        OR tenant_id::text = current_setting('app.current_tenant', true)
    );
