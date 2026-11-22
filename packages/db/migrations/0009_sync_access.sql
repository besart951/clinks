-- One lookup per signed-in membership. Joining the entire role and module catalogs separately in each
-- PowerSync stream makes its parameter result count grow with every other tenant in the installation.
CREATE TABLE sync_access (
	id uuid PRIMARY KEY REFERENCES memberships ON DELETE CASCADE,
	tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES users,
	read_permissions text[] NOT NULL
);
CREATE INDEX ON sync_access (tenant_id,user_id);
ALTER TABLE sync_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_access FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON sync_access USING (tenant_id=current_tenant_id());

CREATE VIEW membership_sync_permissions WITH (security_invoker=true) AS
	SELECT m.id,m.tenant_id,m.user_id,
		ARRAY(SELECT permission FROM unnest(r.permissions) permission
			WHERE permission LIKE '%.read'
			AND (split_part(permission,'.',1) IN ('audit','documents','contacts','calendar')
			OR split_part(permission,'.',1)=ANY(t.enabled_modules))) AS read_permissions
	FROM memberships m JOIN roles r ON r.id=m.role_id AND r.tenant_id=m.tenant_id
	JOIN tenants t ON t.id=m.tenant_id WHERE m.status='active';

INSERT INTO sync_access SELECT * FROM membership_sync_permissions;
CREATE FUNCTION refresh_sync_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_TABLE_NAME='memberships' THEN
		DELETE FROM sync_access WHERE id=NEW.id;
		INSERT INTO sync_access SELECT * FROM membership_sync_permissions WHERE id=NEW.id;
	ELSIF TG_TABLE_NAME='roles' THEN
		INSERT INTO sync_access SELECT p.* FROM membership_sync_permissions p
			JOIN memberships m ON m.id=p.id WHERE m.role_id=NEW.id
			ON CONFLICT (id) DO UPDATE SET read_permissions=EXCLUDED.read_permissions;
	ELSE
		INSERT INTO sync_access SELECT * FROM membership_sync_permissions WHERE tenant_id=NEW.id
			ON CONFLICT (id) DO UPDATE SET read_permissions=EXCLUDED.read_permissions;
	END IF;
	RETURN NULL;
END $$;
CREATE TRIGGER sync_member AFTER INSERT OR UPDATE OF role_id,status,user_id,tenant_id ON memberships
	FOR EACH ROW EXECUTE FUNCTION refresh_sync_access();
CREATE TRIGGER sync_role AFTER UPDATE OF permissions ON roles FOR EACH ROW EXECUTE FUNCTION refresh_sync_access();
CREATE TRIGGER sync_modules AFTER UPDATE OF enabled_modules ON tenants FOR EACH ROW EXECUTE FUNCTION refresh_sync_access();
ALTER PUBLICATION powersync ADD TABLE sync_access;
