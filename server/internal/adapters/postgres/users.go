package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const usersEmailUniqueConstraint = "users_email_unique"

type UserRepository struct {
	pool *pgxpool.Pool
}

func NewUserRepository(
	pool *pgxpool.Pool,
) *UserRepository {
	return &UserRepository{
		pool: pool,
	}
}

func (repository *UserRepository) EnsureSuperAdmin(
	ctx context.Context,
	bootstrap domain.SuperAdminBootstrap,
) error {
	return withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			var isSuperAdmin bool

			err := tx.QueryRow(
				ctx,
				`
					SELECT is_super_admin
					FROM users
					WHERE email = $1
				`,
				bootstrap.Email,
			).Scan(&isSuperAdmin)

			switch {
			case err == nil && isSuperAdmin:
				return nil

			case err == nil:
				return domain.NewError(
					domain.ErrorEmailTaken,
				)

			case err != pgx.ErrNoRows:
				return fmt.Errorf(
					"look up bootstrap administrator: %w",
					err,
				)
			}

			id, err := newUUID()
			if err != nil {
				return err
			}

			_, err = tx.Exec(
				ctx,
				`
					INSERT INTO users (
						id,
						email,
						password_hash,
						is_super_admin,
						locale,
						session_version
					)
					VALUES ($1, $2, $3, TRUE, $4, 1)
				`,
				id,
				bootstrap.Email,
				bootstrap.PasswordHash,
				bootstrap.Locale,
			)

			return mapIdentityDatabaseError(err)
		},
	)
}

func (repository *UserRepository) FindByEmail(
	ctx context.Context,
	email domain.Email,
) (domain.User, domain.PasswordHash, error) {
	var user domain.User
	var passwordHash domain.PasswordHash

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			err := tx.QueryRow(
				ctx,
				`
					SELECT
						id,
						email,
						password_hash,
						is_super_admin,
						locale,
						session_version
					FROM users
					WHERE email = $1
				`,
				email,
			).Scan(
				&user.ID,
				&user.Email,
				&passwordHash,
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
					"find user by email: %w",
					err,
				)
			}

			return nil
		},
	)

	return user, passwordHash, err
}

func (repository *UserRepository) FindByID(
	ctx context.Context,
	userID domain.UserID,
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
						id,
						email,
						is_super_admin,
						locale,
						session_version
					FROM users
					WHERE id = $1
				`,
				userID,
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
					"find user by ID: %w",
					err,
				)
			}

			return nil
		},
	)

	return user, err
}

func (repository *UserRepository) InvalidateSession(
	ctx context.Context,
	userID domain.UserID,
) error {
	return withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			var email domain.Email

			err := tx.QueryRow(
				ctx,
				`
					UPDATE users
					SET
						session_version = session_version + 1,
						updated_at = now()
					WHERE id = $1
					RETURNING email
				`,
				userID,
			).Scan(&email)

			if err == pgx.ErrNoRows {
				return domain.NewError(
					domain.ErrorInvalidCredentials,
				)
			}

			if err != nil {
				return fmt.Errorf(
					"invalidate session: %w",
					err,
				)
			}

			return insertAuditEvent(
				ctx,
				tx,
				domain.AuditEvent{
					ActorID: new(userID),
					Action:  "session.logout",
					Target:  string(email),
				},
			)
		},
	)
}

func mapIdentityDatabaseError(
	err error,
) error {
	if err == nil {
		return nil
	}

	databaseError, ok :=
		errors.AsType[*pgconn.PgError](err)

	if ok &&
		databaseError.ConstraintName ==
			usersEmailUniqueConstraint {
		return domain.NewError(
			domain.ErrorEmailTaken,
		)
	}

	return fmt.Errorf(
		"postgres identity operation: %w",
		err,
	)
}
