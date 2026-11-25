-- The API's and PowerSync's login roles (dev only). Neither is owner or superuser; row-level security applies to clinks_api.
-- Migrations grant table access to `clinks_app` and read access to `clinks_sync`; production uses its own roles the same way.
CREATE ROLE clinks_app NOLOGIN;
CREATE ROLE clinks_api LOGIN PASSWORD 'clinks-api-dev' IN ROLE clinks_app;
CREATE ROLE clinks_sync NOLOGIN;
CREATE ROLE clinks_replication LOGIN REPLICATION BYPASSRLS PASSWORD 'clinks-replication-dev' IN ROLE clinks_sync;
