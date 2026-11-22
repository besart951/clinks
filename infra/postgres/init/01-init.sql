-- Runs once, when the dev database volume is created.

-- PowerSync keeps its bucket storage in a separate database on the same server (dev only).
CREATE DATABASE powersync_storage;

-- A single row that proves replication works end to end until the real schema arrives in phase 3.
CREATE TABLE system_status (
    id text PRIMARY KEY,
    message text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO system_status (id, message) VALUES ('dev', 'PowerSync replication is running');

-- PowerSync replicates every table in this publication.
CREATE PUBLICATION powersync FOR ALL TABLES;
