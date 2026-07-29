// Package postgres implements persistence adapters backed by PostgreSQL.
package postgres

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"log/slog"
	"sort"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/migrations"
)

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	connection, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}
	defer connection.Release()

	if _, err = connection.Exec(ctx, "SELECT pg_advisory_lock(hashtext('clinks_migrations'))"); err != nil {
		return fmt.Errorf("lock migrations: %w", err)
	}
	defer func() {
		if _, unlockErr := connection.Exec(context.Background(), "SELECT pg_advisory_unlock(hashtext('clinks_migrations'))"); unlockErr != nil {
			slog.Error("unlock migrations advisory lock", "error", unlockErr)
		}
	}()

	if _, err = connection.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version TEXT PRIMARY KEY,
		checksum TEXT NOT NULL DEFAULT '',
		applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`); err != nil {
		return fmt.Errorf("create migration ledger: %w", err)
	}
	if _, err = connection.Exec(ctx,
		"ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT NOT NULL DEFAULT ''",
	); err != nil {
		return fmt.Errorf("add migration checksum: %w", err)
	}
	entries, err := migrations.Files.ReadDir(".")
	if err != nil {
		return fmt.Errorf("list migrations: %w", err)
	}
	sort.Slice(entries, func(left, right int) bool {
		return entries[left].Name() < entries[right].Name()
	})
	for _, entry := range entries {
		if entry.IsDir() || entry.Name() == "embed.go" {
			continue
		}
		if err := applyMigration(ctx, connection.Conn(), entry.Name()); err != nil {
			return err
		}
	}
	return nil
}

func applyMigration(ctx context.Context, connection *pgx.Conn, version string) error {
	migrationSQL, readErr := migrations.Files.ReadFile(version)
	if readErr != nil {
		return fmt.Errorf("read migration %s: %w", version, readErr)
	}
	checksum := migrationChecksum(migrationSQL)
	var applied bool
	var recordedChecksum string
	if queryErr := connection.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1), COALESCE((SELECT checksum FROM schema_migrations WHERE version = $1), '')",
		version,
	).Scan(&applied, &recordedChecksum); queryErr != nil {
		return fmt.Errorf("check migration %s: %w", version, queryErr)
	}
	if applied {
		if recordedChecksum == "" {
			if _, updateErr := connection.Exec(ctx,
				"UPDATE schema_migrations SET checksum = $2 WHERE version = $1", version, checksum,
			); updateErr != nil {
				return fmt.Errorf("record migration checksum %s: %w", version, updateErr)
			}
			return nil
		}
		if recordedChecksum != checksum {
			return fmt.Errorf("migration %s checksum does not match the applied migration", version)
		}
		return nil
	}
	tx, err := connection.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin migration %s: %w", version, err)
	}
	defer func() {
		if rollbackErr := tx.Rollback(ctx); rollbackErr != nil && !errors.Is(rollbackErr, pgx.ErrTxClosed) {
			slog.Error("rollback migration transaction", "error", rollbackErr)
		}
	}()
	if _, err = tx.Exec(ctx, string(migrationSQL)); err != nil {
		return fmt.Errorf("execute migration %s: %w", version, err)
	}
	if _, err = tx.Exec(ctx, "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)", version, checksum); err != nil {
		return fmt.Errorf("record migration %s: %w", version, err)
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migration %s: %w", version, err)
	}
	return nil
}

func migrationChecksum(sql []byte) string {
	checksum := sha256.Sum256(sql)
	return fmt.Sprintf("%x", checksum)
}
