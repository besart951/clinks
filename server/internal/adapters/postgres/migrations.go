package postgres

import (
	"cmp"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/migrations"
)

const (
	migrationAdvisoryLockName = "clinks_migrations"
	migrationUnlockTimeout    = 5 * time.Second
)

func Migrate(
	ctx context.Context,
	pool *pgxpool.Pool,
) error {
	connection, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf(
			"acquire migration connection: %w",
			err,
		)
	}
	defer connection.Release()

	if _, err := connection.Exec(
		ctx,
		`
			SELECT pg_advisory_lock(
				hashtext($1)
			)
		`,
		migrationAdvisoryLockName,
	); err != nil {
		return fmt.Errorf(
			"lock migrations: %w",
			err,
		)
	}

	defer unlockMigrations(
		ctx,
		connection,
	)

	if _, err := connection.Exec(
		ctx,
		`
			CREATE TABLE IF NOT EXISTS schema_migrations (
				version TEXT PRIMARY KEY,
				checksum TEXT NOT NULL DEFAULT '',
				applied_at TIMESTAMPTZ
					NOT NULL DEFAULT now()
			)
		`,
	); err != nil {
		return fmt.Errorf(
			"create migration ledger: %w",
			err,
		)
	}

	if _, err := connection.Exec(
		ctx,
		`
			ALTER TABLE schema_migrations
			ADD COLUMN IF NOT EXISTS
				checksum TEXT NOT NULL DEFAULT ''
		`,
	); err != nil {
		return fmt.Errorf(
			"add migration checksum: %w",
			err,
		)
	}

	entries, err := migrations.Files.ReadDir(".")
	if err != nil {
		return fmt.Errorf(
			"list migrations: %w",
			err,
		)
	}

	slices.SortFunc(
		entries,
		func(left, right any) int {
			return cmp.Compare(
				left.(interface{ Name() string }).Name(),
				right.(interface{ Name() string }).Name(),
			)
		},
	)
