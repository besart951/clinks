-- `users.role` remains as a compatibility projection for one release. Global
-- authorization is intentionally stored separately from tenant memberships.
ALTER TABLE users ADD COLUMN global_role TEXT NOT NULL DEFAULT 'ROLE_USER';

UPDATE users
SET global_role = CASE
    WHEN role = 'ROLE_SUPER_ADMIN' THEN 'ROLE_SUPER_ADMIN'
    ELSE 'ROLE_USER'
END;

ALTER TABLE users ADD CONSTRAINT users_global_role_check
    CHECK (global_role IN ('ROLE_SUPER_ADMIN', 'ROLE_USER'));
