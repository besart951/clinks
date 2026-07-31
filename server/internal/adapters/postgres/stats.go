package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type SystemStatsRepository struct {
	pool *pgxpool.Pool
}

func NewSystemStatsRepository(pool *pgxpool.Pool) *SystemStatsRepository {
	return &SystemStatsRepository{pool: pool}
}

func (repository *SystemStatsRepository) Stats(ctx context.Context) (domain.SystemStats, error) {
	var stats domain.SystemStats
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT
			(SELECT COUNT(*) FROM users),
			(SELECT COUNT(*) FROM tenants),
			(SELECT COUNT(*) FROM invitations WHERE used_at IS NULL AND expires_at > now()),
			(SELECT COUNT(*) FROM languages WHERE is_active = TRUE)`).
			Scan(&stats.UserCount, &stats.TenantCount, &stats.PendingInvitationCount, &stats.ActiveLanguageCount)
	})
	if err != nil {
		return domain.SystemStats{}, fmt.Errorf("fetch system stats: %w", err)
	}
	return stats, nil
}
