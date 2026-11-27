-- Mail plan phase 7: retention. Outbox bodies are deleted after 90 days, the rest of a row (who, when, what
-- status) after two years. The retention run goes workspace by workspace (row-level security), so the workspaces
-- with outbox mail are listed here, ids only, and each is checked once a day.
CREATE TABLE auth.mail_retention (
	tenant_id uuid PRIMARY KEY REFERENCES tenants ON DELETE CASCADE,
	checked_at timestamptz NOT NULL DEFAULT '-infinity'
);
-- Registers what the migration role can see; every workspace is registered again with its next mail anyway.
INSERT INTO auth.mail_retention (tenant_id) SELECT DISTINCT tenant_id FROM mail_outbox ON CONFLICT DO NOTHING;
