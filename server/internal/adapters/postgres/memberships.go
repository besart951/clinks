package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type ExternalIdentityRepository struct {
	pool *pgxpool.Pool
}

func NewExternalIdentityRepository(
	pool *pgxpool.Pool,
) *ExternalIdentityRepository {
	return &ExternalIdentityRepository{
		pool: pool,
	}
}

func (repository *ExternalIdentityRepository) FindUser(
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
						user_row.is_super_admin,
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
				&user.IsSuperAdmin,
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

func (repository *ExternalIdentityRepository) Link(
	ctx context.Context,
	userID domain.UserID,
	identity domain.ExternalIdentity,
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
				identity.Subject,r
				userID,
				identity.Email,
			)

			if err != nil {
				return fmt.Errorf(
					"link external identity: %w",
					err,
				)
			}

			return nil
		},
	)
}
