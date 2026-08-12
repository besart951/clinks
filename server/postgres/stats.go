package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	clinks "github.com/besartmorina/clinks/server"
)

func (store *Store) Stats(
	ctx context.Context,
) (clinks.SystemStats, error) {
	var (
		userCount              int64
		tenantCount            int64
		pendingInvitationCount int64
		activeLanguageCount    int64
	)

	err := withSystemTx(
		ctx,
		store.pool,
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
		return clinks.SystemStats{},
			fmt.Errorf(
				"fetch system stats: %w",
				err,
			)
	}

	return clinks.SystemStats{
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
