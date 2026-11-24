-- The app role got every table in public through the blanket grant in 0001, the migration ledger included.
-- Only the owner that runs migrations may read or change it.
REVOKE ALL ON schema_migrations FROM clinks_app;
