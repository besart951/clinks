-- The API's login role (dev only). It is no owner and no superuser, so row-level security applies to it.
-- Migrations grant table access to `clinks_app`; production creates its own login role the same way.
CREATE ROLE clinks_app NOLOGIN;
CREATE ROLE clinks_api LOGIN PASSWORD 'clinks-api-dev' IN ROLE clinks_app;
