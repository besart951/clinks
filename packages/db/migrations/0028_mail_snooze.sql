-- «Später erinnern»: a mail is out of its folder until then, and back on top afterwards.
ALTER TABLE mails ADD COLUMN snoozed_until timestamptz;
