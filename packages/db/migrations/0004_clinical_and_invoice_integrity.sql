-- Keep reservations after an invoice is removed, including across an undo on a second device.
CREATE TABLE invoice_number_counters (
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	year integer NOT NULL,
	last_number bigint NOT NULL,
	PRIMARY KEY (tenant_id, year)
);
CREATE TABLE invoice_number_reservations (
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	invoice_id uuid NOT NULL,
	number text NOT NULL,
	PRIMARY KEY (tenant_id, invoice_id)
);
INSERT INTO invoice_number_reservations SELECT tenant_id, id, number FROM invoices;
INSERT INTO invoice_number_counters
	SELECT tenant_id, left(number, 4)::integer, max(substr(number, 6)::bigint)
	FROM invoices WHERE number ~ '^[0-9]{4}-[0-9]{1,15}$' GROUP BY 1, 2;
ALTER TABLE invoice_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_number_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON invoice_number_counters USING (tenant_id = current_tenant_id());
ALTER TABLE invoice_number_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_number_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON invoice_number_reservations USING (tenant_id = current_tenant_id());

CREATE FUNCTION assign_invoice_number() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	y integer;
	n text;
BEGIN
	IF TG_OP = 'UPDATE' THEN
		NEW.number := OLD.number;
		RETURN NEW;
	END IF;
	SELECT number INTO NEW.number FROM invoice_number_reservations
		WHERE tenant_id = NEW.tenant_id AND invoice_id = NEW.id;
	IF NOT FOUND THEN
		y := extract(year FROM NEW.issue_date);
		INSERT INTO invoice_number_counters VALUES (NEW.tenant_id, y, 1)
			ON CONFLICT (tenant_id, year) DO UPDATE SET last_number = invoice_number_counters.last_number + 1
			RETURNING last_number::text INTO n;
		NEW.number := y::text || '-' || lpad(n, greatest(4, length(n)), '0');
		INSERT INTO invoice_number_reservations VALUES (NEW.tenant_id, NEW.id, NEW.number);
	END IF;
	RETURN NEW;
END $$;
CREATE TRIGGER number_invoices BEFORE INSERT OR UPDATE ON invoices
	FOR EACH ROW EXECUTE FUNCTION assign_invoice_number();

CREATE FUNCTION keep_clinical_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'clinical notes are append-only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER keep_physio_note BEFORE UPDATE OR DELETE ON physio_notes FOR EACH ROW EXECUTE FUNCTION keep_clinical_note();
CREATE TRIGGER keep_spitex_note BEFORE UPDATE OR DELETE ON spitex_notes FOR EACH ROW EXECUTE FUNCTION keep_clinical_note();
