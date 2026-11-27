-- Mail plan phase 3: incoming mail. One catch-all mailbox on the inbound domain receives two kinds of mail:
-- copies sent to a workspace's filing address (BCC or forwarding), filed at the matching contact, and bounces to
-- the per-mail Return-Path, which mark the mail undeliverable and block the address.

-- Filing addresses by their random local part, across workspaces: the worker reads it before it knows the
-- workspace. Who created one is credited with the attachments it files.
CREATE TABLE auth.mail_inbound_addresses (
	local_part text PRIMARY KEY CHECK (local_part ~ '^ablage-[a-z0-9]{10}$'),
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	created_by uuid NOT NULL REFERENCES users,
	active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mail_inbound_addresses_active ON auth.mail_inbound_addresses (tenant_id) WHERE active;

-- Addresses the workspace no longer sends to: bounced (all mail) or unsubscribed (newsletters only).
CREATE TABLE mail_suppressions (
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	address text NOT NULL CHECK (address = lower(address)),
	scope text NOT NULL CHECK (scope IN ('all', 'newsletter')),
	reason text NOT NULL CHECK (reason IN ('bounced', 'unsubscribed', 'complaint', 'manual')),
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (tenant_id, address, scope)
);
ALTER TABLE mail_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_suppressions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON mail_suppressions USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

-- Mails sent through the outbox or filed from outside carry their Message-ID (no mail is filed twice) and, when
-- sent by CLinks, their delivery, so the contact's mail list shows undeliverable mail.
ALTER TABLE mails ADD COLUMN message_id text;
ALTER TABLE mails ADD COLUMN delivery text CHECK (delivery IN ('queued', 'sent', 'bounced', 'failed', 'suppressed'));
CREATE UNIQUE INDEX mails_message_id ON mails (tenant_id, message_id) WHERE message_id IS NOT NULL;
