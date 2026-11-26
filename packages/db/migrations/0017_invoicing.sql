-- Invoicing without outside services (docs/product/invoicing.md), phase 1: the workspace's QR-IBAN and invoice
-- settings, and the service period every invoice states (Art. 26 MWSTG).

ALTER TABLE tenants ADD COLUMN qr_iban text NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN invoice_settings jsonb NOT NULL DEFAULT
	'{"paymentTermDays":30,"footer":"","delivery":"auto","reminders":[{"days":10,"fee":0,"text":""},{"days":10,"fee":0,"text":""},{"days":10,"fee":0,"text":""}],"defaultInterest":false}';

ALTER TABLE invoices ADD COLUMN service_from date;
ALTER TABLE invoices ADD COLUMN service_to date;
ALTER TABLE invoices ADD CONSTRAINT invoice_service_period CHECK (service_to IS NULL OR service_from <= service_to);
