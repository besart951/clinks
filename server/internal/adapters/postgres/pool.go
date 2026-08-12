// Package postgres implements persistence adapters backed by PostgreSQL.
package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const (
	tenantSettingKey = "app.current_tenant"
	systemSettingKey = "app.bypass_rls"

	defaultPoolPingTimeout = 5 * time.Second
)

type PoolConfig struct {
	DatabaseURL       string
	MaxConns          int32
	MinConns          int32
	MaxConnLifetime   time.Duration
	MaxConnIdleTime   time.Duration
	HealthCheckPeriod time.Duration
	PingTimeout       time.Duration
}

func NewPool(
	ctx context.Context,
	poolConfig PoolConfig,
) (*pgxpool.Pool, func(), error) {
	config, err := pgxpool.ParseConfig(
		poolConfig.DatabaseURL,
	)
	if err != nil {
		return nil, nil,
			fmt.Errorf("parse database URL: %w", err)
	}

	if poolConfig.MaxConns > 0 {
		config.MaxConns = poolConfig.MaxConns
	}

	if poolConfig.MinConns >= 0 {
		config.MinConns = poolConfig.MinConns
	}

	if poolConfig.MaxConnLifetime > 0 {
		config.MaxConnLifetime =
			poolConfig.MaxConnLifetime
	}

	if poolConfig.MaxConnIdleTime > 0 {
		config.MaxConnIdleTime =
			poolConfig.MaxConnIdleTime
	}

	if poolConfig.HealthCheckPeriod > 0 {
		config.HealthCheckPeriod =
			poolConfig.HealthCheckPeriod
	}

	config.PingTimeout = poolConfig.PingTimeout
	if config.PingTimeout <= 0 {
		config.PingTimeout = defaultPoolPingTimeout
	}

	pool, err := pgxpool.NewWithConfig(
		ctx,
		config,
	)
	if err != nil {
		return nil, nil,
			fmt.Errorf("open postgres pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()

		return nil, nil,
			fmt.Errorf("ping postgres: %w", err)
	}

	return pool, pool.Close, nil
}

func WithTenantTx(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenantID domain.TenantID,
	operation func(pgx.Tx) error,
) error {
	return withSettingTx(
		ctx,
		pool,
		tenantSettingKey,
		string(tenantID),
		operation,
	)
}

func withSystemTx(
	ctx context.Context,
	pool *pgxpool.Pool,
	operation func(pgx.Tx) error,
) error {
	return withSettingTx(
		ctx,
		pool,
		systemSettingKey,
		"true",
		operation,
	)
}

func withSettingTx(
	ctx context.Context,
	pool *pgxpool.Pool,
	key,
	value string,
	operation func(pgx.Tx) error,
) error {
	return pgx.BeginFunc(
		ctx,
		pool,
		func(tx pgx.Tx) error {
			if _, err := tx.Exec(
				ctx,
				"SELECT set_config($1, $2, true)",
				key,
				value,
			); err != nil {
				return fmt.Errorf(
					"set transaction context: %w",
					err,
				)
			}

			return operation(tx)
		},
	)
}

type Readiness struct {
	pool *pgxpool.Pool
}

func NewReadiness(
	pool *pgxpool.Pool,
) *Readiness {
	return &Readiness{
		pool: pool,
	}
}

func (readiness *Readiness) Ready(
	ctx context.Context,
) error {
	if err := readiness.pool.Ping(ctx); err != nil {
		return fmt.Errorf(
			"ping postgres: %w",
			err,
		)
	}

	return nil
}
