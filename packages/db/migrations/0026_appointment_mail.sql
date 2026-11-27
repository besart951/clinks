-- Mail plan phase 6: appointment confirmations and reminders. Per workspace on or off (default off), per contact
-- «Erinnerungen» (null: on, the default). The mobile number is kept for SMS, which follows later. Both columns are
-- nullable like the other optional contact fields, so a contact created on a device without them stays valid.

ALTER TABLE contacts ADD COLUMN reminders boolean;
ALTER TABLE contacts ADD COLUMN mobile text;
-- When the reminder for the current start went out; moving the appointment clears it.
ALTER TABLE appointments ADD COLUMN reminded_at timestamptz;
ALTER TABLE tenants ADD COLUMN appointment_mail jsonb NOT NULL
	DEFAULT '{"confirmation": false, "reminder": false, "hoursBefore": 24, "text": "", "spitexVisits": false}';

-- Reminders due across workspaces, for the worker (ids only, like auth.mail_queue).
CREATE TABLE auth.appointment_reminders (
	appointment_id uuid PRIMARY KEY REFERENCES appointments ON DELETE CASCADE,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	due_at timestamptz NOT NULL
);
CREATE INDEX appointment_reminders_due ON auth.appointment_reminders (due_at);
