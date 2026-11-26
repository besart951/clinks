-- Invoicing phase 2: the PDF/A of an issued invoice is archived once and nothing it shows can change afterwards
-- (Art. 958f OR, Art. 9 GeBüV). Corrections go by credit note and a new invoice.

ALTER TABLE invoices ADD COLUMN document_id uuid REFERENCES documents ON DELETE RESTRICT;
ALTER TABLE invoices ADD COLUMN pdf_sha256 text;

-- Archived files: neither renamed, replaced nor deleted; filing them in another folder or linking a contact is fine.
ALTER TABLE documents ADD COLUMN locked boolean NOT NULL DEFAULT false;

CREATE FUNCTION keep_issued_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF OLD.status <> 'draft' AND (
		NEW.kind IS DISTINCT FROM OLD.kind OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
		OR NEW.issue_date IS DISTINCT FROM OLD.issue_date OR NEW.due_date IS DISTINCT FROM OLD.due_date
		OR NEW.lines IS DISTINCT FROM OLD.lines OR NEW.notes IS DISTINCT FROM OLD.notes
		OR NEW.service_from IS DISTINCT FROM OLD.service_from OR NEW.service_to IS DISTINCT FROM OLD.service_to
		OR NEW.appointment_ids IS DISTINCT FROM OLD.appointment_ids OR NEW.status = 'draft'
	) THEN
		RAISE EXCEPTION 'issued invoices cannot be changed' USING ERRCODE = '23514';
	END IF;
	IF OLD.document_id IS NOT NULL AND (NEW.document_id IS DISTINCT FROM OLD.document_id
		OR NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256) THEN
		RAISE EXCEPTION 'the archived invoice file cannot be replaced' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END $$;
CREATE TRIGGER keep_issued_invoice BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION keep_issued_invoice();

CREATE FUNCTION keep_issued_invoice_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF OLD.status <> 'draft' THEN
		RAISE EXCEPTION 'issued invoices cannot be deleted' USING ERRCODE = '23514';
	END IF;
	RETURN OLD;
END $$;
CREATE TRIGGER keep_issued_invoice_row BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION keep_issued_invoice_row();

CREATE FUNCTION keep_locked_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF OLD.locked AND (TG_OP = 'DELETE' OR NEW.locked IS DISTINCT FROM OLD.locked OR NEW.name IS DISTINCT FROM OLD.name
		OR NEW.data_url IS DISTINCT FROM OLD.data_url OR NEW.size IS DISTINCT FROM OLD.size
		OR NEW.mime_type IS DISTINCT FROM OLD.mime_type) THEN
		RAISE EXCEPTION 'archived documents cannot be changed' USING ERRCODE = '23514';
	END IF;
	RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER keep_locked_document BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION keep_locked_document();
