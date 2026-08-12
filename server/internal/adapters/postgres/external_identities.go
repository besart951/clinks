package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func (repository *Store) FindUser(
	ctx context.Context,
	issuer domain.ExternalIssuer,
	subject domain.ExternalSubject,
) (domain.User, error) {
	var user domain.User

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			err := tx.QueryRow(
				ctx,
				`
					SELECT
						user_row.id,
						user_row.email,
						user_row.global_role,
						user_row.locale,
						user_row.session_version
					FROM external_identities identity
					JOIN users user_row
						ON user_row.id = identity.user_id
					WHERE
						identity.issuer = $1
						AND identity.subject = $2
				`,
				issuer,
				subject,
			).Scan(
				&user.ID,
				&user.Email,
				&user.GlobalRole,
				&user.Locale,
				&user.SessionVersion,
			)

			if err == pgx.ErrNoRows {
				return domain.NewError(
					domain.ErrorInvalidCredentials,
				)
			}

			if err != nil {
				return fmt.Errorf(
					"find external identity: %w",
					err,
				)
			}

			return nil
		},
	)

	return user, err
}

func (repository *Store) LinkWithAudit(
	ctx context.Context,
	userID domain.UserID,
	identity domain.ExternalIdentity,
	tenantID *domain.TenantID,
) error {
	return withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			_, err := tx.Exec(
				ctx,
				`
					INSERT INTO external_identities (
						issuer,
						subject,
						user_id,
						email
					)
					VALUES ($1, $2, $3, $4)
				`,
				identity.Issuer,
				identity.Subject,
				userID,
				identity.Email,
			)
			if err != nil {
				return constraintConflict(fmt.Errorf(
					"link external identity: %w",
					err,
				))
			}

			return insertAuditEvent(ctx, tx, domain.AuditEvent{
				ActorID:  new(userID),
				TenantID: tenantID,
				Action:   "identity.oidc_linked",
				Target:   string(identity.Issuer),
			})
		},
	)
}
