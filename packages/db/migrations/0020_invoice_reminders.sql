-- Invoicing phase 4: reminders are sent by the server, each with its own deadline, fee and archived PDF.
-- Clients no longer write the reminder level; the API sets both columns when it sends a reminder.

ALTER TABLE invoices ALTER COLUMN reminder_level SET DEFAULT 0;
ALTER TABLE invoices ADD COLUMN reminders jsonb NOT NULL DEFAULT '[]';
ALTER TABLE invoices ADD CONSTRAINT invoices_reminders_array CHECK (jsonb_typeof(reminders) = 'array');

-- Sent reminders stay: the list only grows.
CREATE FUNCTION keep_sent_reminders() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NOT (NEW.reminders @> OLD.reminders AND jsonb_array_length(NEW.reminders) >= jsonb_array_length(OLD.reminders)) THEN
		RAISE EXCEPTION 'sent reminders cannot be changed' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END $$;
CREATE TRIGGER keep_sent_reminders BEFORE UPDATE OF reminders ON invoices FOR EACH ROW EXECUTE FUNCTION keep_sent_reminders();
