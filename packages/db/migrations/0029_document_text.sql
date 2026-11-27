-- Full-text search in documents: the server reads the text of each file version (text files, PDFs with a text
-- layer) into search_text, which syncs read-only to the clients. Scans without a text layer stay without text.
ALTER TABLE documents ADD COLUMN search_text text;

-- Files waiting for their text to be read, across workspaces (ids only, like auth.mail_queue).
CREATE TABLE auth.document_text_queue (
	document_id uuid PRIMARY KEY REFERENCES documents ON DELETE CASCADE,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	queued_at timestamptz NOT NULL DEFAULT now()
);

-- Every new file and every new version queues itself, whichever way it was stored.
CREATE FUNCTION auth.queue_document_text() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'INSERT' OR NEW.data_url IS DISTINCT FROM OLD.data_url THEN
		INSERT INTO auth.document_text_queue (document_id, tenant_id) VALUES (NEW.id, NEW.tenant_id)
		ON CONFLICT (document_id) DO NOTHING;
	END IF;
	RETURN NEW;
END
$$;
CREATE TRIGGER documents_queue_text AFTER INSERT OR UPDATE OF data_url ON documents
	FOR EACH ROW EXECUTE FUNCTION auth.queue_document_text();

-- Registers what the migration role can see; files of other workspaces queue with their next version.
INSERT INTO auth.document_text_queue (document_id, tenant_id) SELECT id, tenant_id FROM documents ON CONFLICT DO NOTHING;
