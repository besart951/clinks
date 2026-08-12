package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const usersEmailUniqueConstraint = "users_email_unique"

func (repository *Store) EnsureSuperAdmin(
	ctx context.Context,
	bootstrap domain.SuperAdminBootstrap,
) error {
	return withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			var globalRole domain.GlobalRole

			err := tx.QueryRow(
				ctx,
				`
					SELECT global_role
					FROM users
					WHERE email = $1
				`,
				bootstrap.Email,
			).Scan(&globalRole)

			switch {
			case err == nil && globalRole.IsSuperAdministrator():
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
						global_role,
						locale,
						session_version
					)
					VALUES ($1, $2, $3, $4, $5, 1)
				`,
				id,
				bootstrap.Email,
				bootstrap.PasswordHash,
				domain.GlobalRoleSuperAdministrator,
				bootstrap.Locale,
			)

			return mapIdentityDatabaseError(err)
		},
	)
}

func (repository *Store) FindByEmail(
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
						global_role,
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
					"find user by email: %w",
					err,
				)
			}

			return nil
		},
	)

	return user, passwordHash, err
}

func (repository *Store) FindByID(
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
						global_role,
						locale,
						session_version
					FROM users
					WHERE id = $1
				`,
				userID,
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
					"find user by ID: %w",
					err,
				)
			}

			return nil
		},
	)

	return user, err
}

func (repository *Store) InvalidateSession(
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

func (repository *Store) RotateTenantSession(
	ctx context.Context,
	userID domain.UserID,
	tenantID domain.TenantID,
	tenantName string,
) (int, error) {
	var sessionVersion int

	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `
			UPDATE users
			SET session_version = session_version + 1, updated_at = now()
			WHERE id = $1
			RETURNING session_version
		`, userID).Scan(&sessionVersion)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewError(domain.ErrorInvalidCredentials)
		}
		if err != nil {
			return fmt.Errorf("rotate tenant session: %w", err)
		}

		return insertAuditEvent(ctx, tx, domain.AuditEvent{
			ActorID:  new(userID),
			TenantID: new(tenantID),
			Action:   "tenant.switch",
			Target:   tenantName,
		})
	})

	return sessionVersion, err
}

func mapIdentityDatabaseError(
	err error,
) error {
	if err == nil {
		return nil
	}

	databaseError, ok := errors.AsType[*pgconn.PgError](err)

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
