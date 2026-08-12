package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func (repository *Store) Stats(
	ctx context.Context,
) (domain.SystemStats, error) {
	var (
		userCount              int64
		tenantCount            int64
		pendingInvitationCount int64
		activeLanguageCount    int64
	)

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			return tx.QueryRow(
				ctx,
				`
					SELECT
						(SELECT COUNT(*) FROM users),
						(SELECT COUNT(*) FROM tenants),
						(
							SELECT COUNT(*)
							FROM invitations
							WHERE
								used_at IS NULL
								AND expires_at > now()
						),
						(
							SELECT COUNT(*)
							FROM languages
							WHERE is_active = TRUE
						)
				`,
			).Scan(
				&userCount,
				&tenantCount,
				&pendingInvitationCount,
				&activeLanguageCount,
			)
		},
	)
	if err != nil {
		return domain.SystemStats{},
			fmt.Errorf(
				"fetch system stats: %w",
				err,
			)
	}

	return domain.SystemStats{
		UserCount:   int(userCount),
		TenantCount: int(tenantCount),
		PendingInvitationCount: int(
			pendingInvitationCount,
		),
		ActiveLanguageCount: int(
			activeLanguageCount,
		),
	}, nil
}
