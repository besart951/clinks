-- Invoicing phase 5: payments from camt.053/camt.054 bank files. The file is kept as accounting record (locked
-- document); each credit becomes one entry, booked onto the invoice its QR or Creditor Reference names. The bank's
-- entry reference is unique per workspace, so a file imported twice books nothing twice. Payer names and messages
-- are kept only to assign the remaining credits by hand (nDSG: purpose limitation).

CREATE TABLE bank_imports (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	file_name text NOT NULL,
	kind text NOT NULL CHECK (kind IN ('camt.053', 'camt.054')),
	sha256 text NOT NULL,
	document_id uuid NOT NULL REFERENCES documents,
	imported_at timestamptz NOT NULL,
	imported_by uuid REFERENCES users ON DELETE SET NULL,
	credits integer NOT NULL,
	booked integer NOT NULL,
	duplicates integer NOT NULL,
	UNIQUE (tenant_id, sha256)
);
ALTER TABLE bank_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON bank_imports USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());

CREATE TABLE bank_entries (
	id uuid PRIMARY KEY,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	import_id uuid NOT NULL REFERENCES bank_imports ON DELETE CASCADE,
	bank_ref text NOT NULL,
	booked_on date NOT NULL,
	amount integer NOT NULL CHECK (amount > 0),
	currency text NOT NULL,
	reference text NOT NULL DEFAULT '',
	debtor text NOT NULL DEFAULT '',
	info text NOT NULL DEFAULT '',
	status text NOT NULL CHECK (status IN ('booked', 'open', 'ignored')),
	invoice_id uuid REFERENCES invoices ON DELETE SET NULL,
	CHECK ((status = 'booked') = (invoice_id IS NOT NULL)),
	UNIQUE (tenant_id, bank_ref)
);
CREATE INDEX bank_entries_open ON bank_entries (tenant_id, status);
ALTER TABLE bank_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON bank_entries USING (tenant_id = current_tenant_id())
	WITH CHECK (tenant_id = current_tenant_id());
