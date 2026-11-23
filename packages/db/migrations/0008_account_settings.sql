ALTER TABLE tenants ADD COLUMN logo_data_url text,
	ADD COLUMN address jsonb NOT NULL DEFAULT '{"street":"","zip":"","city":""}',
	ADD COLUMN vat_number text NOT NULL DEFAULT '',
	ADD COLUMN iban text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN avatar_data_url text,
	ADD COLUMN notification_preferences jsonb NOT NULL DEFAULT '{"inApp":true,"email":true,"push":false,"digest":"daily"}';
