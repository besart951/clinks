CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS users_email_trgm_idx
    ON users USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS audit_events_target_trgm_idx
    ON audit_events USING gin (target gin_trgm_ops);

CREATE INDEX IF NOT EXISTS invitations_email_trgm_idx
    ON invitations USING gin (email gin_trgm_ops);
