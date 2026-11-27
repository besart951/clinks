-- Mail plan phase 5: newsletters with double opt-in. A contact's newsletter status is synced and set only by the
-- server; how it came about (form, manual entry, import, unsubscribe) is kept as an append-only log for proof.

ALTER TABLE contacts ADD COLUMN newsletter text NOT NULL DEFAULT 'none'
	CHECK (newsletter IN ('none', 'pending', 'subscribed', 'unsubscribed'));

-- Sign-up forms. The public token starts with the workspace id (base32), so the page finds its workspace without a
-- lookup table across workspaces.
CREATE TABLE newsletter_forms (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	token text NOT NULL UNIQUE,
	title text NOT NULL,
	intro text NOT NULL,
	tags jsonb NOT NULL DEFAULT '[]',
	consent_text text NOT NULL,
	active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- A sign-up waiting for its confirmation link (one-time token `newsletter_optin`). Nothing is added to the contacts
-- before it is confirmed; unconfirmed requests are deleted after seven days.
CREATE TABLE newsletter_requests (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	form_id uuid NOT NULL REFERENCES newsletter_forms ON DELETE CASCADE,
	first_name text NOT NULL,
	last_name text NOT NULL,
	email text NOT NULL,
	ip_hash text,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE newsletter_consents (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	contact_id uuid NOT NULL REFERENCES contacts ON DELETE CASCADE,
	status text NOT NULL CHECK (status IN ('subscribed', 'unsubscribed')),
	source text NOT NULL CHECK (source IN ('form', 'manual', 'import', 'unsubscribe_link', 'bounce')),
	-- The text the person agreed to (form) or what was recorded by hand.
	consent_text text NOT NULL DEFAULT '',
	note text NOT NULL DEFAULT '',
	ip_hash text,
	actor_id uuid REFERENCES users ON DELETE SET NULL,
	campaign_id uuid REFERENCES campaigns ON DELETE SET NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX newsletter_consents_contact ON newsletter_consents (contact_id, created_at);

DO $$
DECLARE
	name text;
BEGIN
	FOREACH name IN ARRAY ARRAY['newsletter_forms', 'newsletter_requests', 'newsletter_consents'] LOOP
		EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', name);
		EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', name);
		EXECUTE format(
			'CREATE POLICY tenant_scope ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',
			name
		);
	END LOOP;
END $$;
-- Proof of consent is never rewritten.
REVOKE UPDATE ON newsletter_consents FROM clinks_app;

ALTER TABLE auth.one_time_tokens DROP CONSTRAINT one_time_tokens_purpose_check;
ALTER TABLE auth.one_time_tokens ADD CONSTRAINT one_time_tokens_purpose_check
	CHECK (purpose IN ('verify_email', 'reset_password', 'invitation', 'two_factor', 'invoice_link', 'newsletter_optin'));
ALTER TABLE auth.one_time_tokens ADD COLUMN newsletter_request_id uuid REFERENCES newsletter_requests ON DELETE CASCADE;

-- Campaigns: the workflow and the numbers belong to the server now; clients edit the content only.
ALTER TABLE campaigns ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE campaigns ALTER COLUMN stats SET DEFAULT '{"recipients": 0, "sent": 0, "bounced": 0, "unsubscribes": 0}';
UPDATE campaigns SET stats = jsonb_build_object(
	'recipients', coalesce((stats ->> 'recipients')::int, 0),
	'sent', coalesce((stats ->> 'recipients')::int, 0),
	'bounced', 0,
	'unsubscribes', coalesce((stats ->> 'unsubscribes')::int, 0)
);
-- Who sent it to review: the four-eyes rule compares them with who approves.
ALTER TABLE campaigns ADD COLUMN submitted_by uuid REFERENCES users ON DELETE SET NULL;
ALTER TABLE mail_outbox ADD COLUMN campaign_id uuid REFERENCES campaigns ON DELETE SET NULL;
CREATE INDEX mail_outbox_campaign ON mail_outbox (campaign_id) WHERE campaign_id IS NOT NULL;

-- Campaigns due to go out, across workspaces, for the worker (ids only, like auth.mail_queue).
CREATE TABLE auth.campaign_queue (
	campaign_id uuid PRIMARY KEY REFERENCES campaigns ON DELETE CASCADE,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	due_at timestamptz NOT NULL
);
CREATE INDEX campaign_queue_due ON auth.campaign_queue (due_at);
