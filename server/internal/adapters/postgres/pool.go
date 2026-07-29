package postgres

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type PoolConfig struct {
	DatabaseURL       string
	MaxConns          int32
	MinConns          int32
	MaxConnLifetime   time.Duration
	MaxConnIdleTime   time.Duration
	HealthCheckPeriod time.Duration
}

func NewPool(ctx context.Context, poolConfig PoolConfig) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(poolConfig.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL: %w", err)
	}
	config.MaxConns = poolConfig.MaxConns
	config.MinConns = poolConfig.MinConns
	config.MaxConnLifetime = poolConfig.MaxConnLifetime
	config.MaxConnIdleTime = poolConfig.MaxConnIdleTime
	config.HealthCheckPeriod = poolConfig.HealthCheckPeriod
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("open postgres pool: %w", err)
	}
	if err = pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return pool, nil
}

func WithTenantTx(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID domain.TenantID,
	operation func(pgx.Tx) error,
) error {
	return withSettingTx(ctx, pool, "app.current_tenant", string(tenantID), operation)
}

func withSystemTx(
	ctx context.Context,
	pool *pgxpool.Pool,
	operation func(pgx.Tx) error,
) error {
	return withSettingTx(ctx, pool, "app.bypass_rls", "true", operation)
}

type Readiness struct {
	pool *pgxpool.Pool
}

func NewReadiness(pool *pgxpool.Pool) *Readiness {
	return &Readiness{pool: pool}
}

func (readiness *Readiness) Ready(ctx context.Context) error {
	if err := readiness.pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping postgres: %w", err)
	}
	return nil
}

func withSettingTx(
	ctx context.Context,
	pool *pgxpool.Pool,
	key string,
	value string,
	operation func(pgx.Tx) error,
) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() {
		if rollbackErr := tx.Rollback(ctx); rollbackErr != nil && !errors.Is(rollbackErr, pgx.ErrTxClosed) {
			slog.Error("rollback tenant transaction", "error", rollbackErr)
		}
	}()

	if _, err = tx.Exec(ctx, "SELECT set_config($1, $2, true)", key, value); err != nil {
		return fmt.Errorf("set transaction context: %w", err)
	}
	if operationErr := operation(tx); operationErr != nil {
		return operationErr
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}
