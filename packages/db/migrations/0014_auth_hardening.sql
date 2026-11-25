-- TOTP replay tracking, token expiry indexes and explicit audit immutability.

ALTER TABLE auth.credentials ADD COLUMN totp_last_step bigint;

CREATE INDEX refresh_tokens_expires_at ON auth.refresh_tokens (expires_at);
CREATE INDEX one_time_tokens_expires_at ON auth.one_time_tokens (expires_at);

REVOKE UPDATE, DELETE ON audit FROM clinks_app;
