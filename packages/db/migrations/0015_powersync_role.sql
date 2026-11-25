-- Dedicated least-privilege role for PowerSync logical replication and initial snapshots (no auth schema access).

DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'clinks_sync') THEN
		CREATE ROLE clinks_sync NOLOGIN;
	END IF;
END
$$;

REVOKE ALL ON SCHEMA auth FROM clinks_sync;
GRANT USAGE ON SCHEMA public TO clinks_sync;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO clinks_sync;
REVOKE ALL ON schema_migrations FROM clinks_sync;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO clinks_sync;
