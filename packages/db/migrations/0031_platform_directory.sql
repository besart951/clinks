-- Operational access authorizes the platform operator without publishing a staff profile.
ALTER TABLE memberships ADD COLUMN platform_access boolean NOT NULL DEFAULT false;

-- Authentication still resolves the caller's own role. Tenant team queries, including
-- the active administrator count, see the ordinary memberships of their workspace.
-- Sync-maintenance triggers must still refresh the access grant on role/module changes.
CREATE POLICY membership_platform_directory ON memberships AS RESTRICTIVE
    FOR SELECT TO clinks_app USING (NOT platform_access OR user_id = current_user_id() OR pg_trigger_depth() > 0);
