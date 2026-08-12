package postgres

import (
	"cmp"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/migrations"
)

const (
	migrationAdvisoryLockName = "clinks_migrations"
	migrationUnlockTimeout    = 5 * time.Second
)

func Migrate(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	if pool == nil {
		return errors.New("migration pool is required")
	}
	if logger == nil {
		return errors.New("migration logger is required")
	}
	connection, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}
	defer connection.Release()

	if _, err := connection.Exec(ctx,
		"SELECT pg_advisory_lock(hashtext($1))",
		migrationAdvisoryLockName,
	); err != nil {
		return fmt.Errorf("lock migrations: %w", err)
	}
	defer unlockMigrations(connection, logger)

	if _, err := connection.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			checksum TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		return fmt.Errorf("create migration ledger: %w", err)
	}

	entries, err := migrations.Files.ReadDir(".")
	if err != nil {
		return fmt.Errorf("list migrations: %w", err)
	}
	slices.SortFunc(entries, func(left, right fs.DirEntry) int {
		return cmp.Compare(left.Name(), right.Name())
	})

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if err := applyMigration(ctx, connection.Conn(), entry.Name(), logger); err != nil {
			return err
		}
	}

	return nil
}

func applyMigration(
	ctx context.Context,
	connection *pgx.Conn,
	version string,
	logger *slog.Logger,
) error {
	sql, err := migrations.Files.ReadFile(version)
	if err != nil {
		return fmt.Errorf("read migration %s: %w", version, err)
	}

	checksum := migrationChecksum(sql)
	var recorded string
	err = connection.QueryRow(ctx,
		"SELECT checksum FROM schema_migrations WHERE version = $1",
		version,
	).Scan(&recorded)
	switch {
	case err == nil && recorded == checksum:
		return nil
	case err == nil:
		return fmt.Errorf("migration %s checksum does not match the applied migration", version)
	case !errors.Is(err, pgx.ErrNoRows):
		return fmt.Errorf("check migration %s: %w", version, err)
	}

	tx, err := connection.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin migration %s: %w", version, err)
	}
	defer func() {
		rollbackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), migrationUnlockTimeout)
		defer cancel()
		if rollbackErr := tx.Rollback(rollbackCtx); rollbackErr != nil && !errors.Is(rollbackErr, pgx.ErrTxClosed) {
			logger.Error("rollback migration", "version", version, "error", rollbackErr)
		}
	}()

	if _, err := tx.Exec(ctx, string(sql)); err != nil {
		return fmt.Errorf("execute migration %s: %w", version, err)
	}
	if _, err := tx.Exec(ctx,
		"INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
		version,
		checksum,
	); err != nil {
		return fmt.Errorf("record migration %s: %w", version, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migration %s: %w", version, err)
	}

	return nil
}

func migrationChecksum(sql []byte) string {
	return fmt.Sprintf("%x", sha256.Sum256(sql))
}

func unlockMigrations(connection *pgxpool.Conn, logger *slog.Logger) {
	ctx, cancel := context.WithTimeout(context.Background(), migrationUnlockTimeout)
	defer cancel()

	if _, err := connection.Exec(ctx,
		"SELECT pg_advisory_unlock(hashtext($1))",
		migrationAdvisoryLockName,
	); err != nil {
		logger.Error("unlock migrations advisory lock", "error", err)
	}
}
