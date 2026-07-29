package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type UserRepository struct {
	pool *pgxpool.Pool
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

func (repository *UserRepository) EnsureSuperAdmin(ctx context.Context, bootstrap domain.SuperAdminBootstrap) error {
	return withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		var globalRole domain.Role
		err := tx.QueryRow(ctx, "SELECT global_role FROM users WHERE email = $1", bootstrap.Email).Scan(&globalRole)
		if err == nil && globalRole == domain.RoleSuperAdmin {
			return nil
		}
		if err == nil {
			return domain.NewError(domain.ErrorEmailTaken)
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("look up bootstrap administrator: %w", err)
		}
		id, err := newUUID()
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO users (id, tenant_id, email, password_hash, role, global_role, locale)
			VALUES ($1, NULL, $2, $3, $4, $5, $6)`, id, bootstrap.Email, bootstrap.PasswordHash, domain.RoleSuperAdmin, domain.RoleSuperAdmin, bootstrap.Locale)
		return mapIdentityDatabaseError(err)
	})
}

func (repository *UserRepository) FindByEmail(ctx context.Context, email domain.Email) (domain.User, domain.PasswordHash, error) {
	var user domain.User
	var passwordHash domain.PasswordHash
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `SELECT id, email, password_hash, global_role, locale, session_version
			FROM users WHERE email = $1`, email).Scan(&user.ID, &user.Email, &passwordHash, &user.Role, &user.Locale, &user.SessionVersion)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewError(domain.ErrorInvalidCredentials)
		}
		if err != nil {
			return fmt.Errorf("find user by email: %w", err)
		}
		return nil
	})
	return user, passwordHash, err
}

func (repository *UserRepository) FindByID(ctx context.Context, id domain.UserID) (domain.User, error) {
	var user domain.User
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `SELECT id, email, global_role, locale, session_version FROM users WHERE id = $1`, id).Scan(&user.ID, &user.Email, &user.Role, &user.Locale, &user.SessionVersion)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewError(domain.ErrorUnauthorized)
		}
		if err != nil {
			return fmt.Errorf("find user by ID: %w", err)
		}
		return nil
	})
	return user, err
}

func (repository *UserRepository) InvalidateSession(ctx context.Context, user domain.User) error {
	return withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		result, err := tx.Exec(ctx, "UPDATE users SET session_version = session_version + 1, updated_at = now() WHERE id = $1", user.ID)
		if err != nil {
			return fmt.Errorf("invalidate session: %w", err)
		}
		if result.RowsAffected() != 1 {
			return domain.NewError(domain.ErrorUnauthorized)
		}
		event := domain.AuditEvent{ActorID: &user.ID, Action: "session.logout", Target: string(user.Email)}
		return insertAuditEvent(ctx, tx, &event)
	})
}

func newUUID() (string, error) {
	value, err := uuid.NewV7()
	if err != nil {
		return "", fmt.Errorf("generate UUIDv7: %w", err)
	}
	return value.String(), nil
}

func mapIdentityDatabaseError(err error) error {
	if err == nil {
		return nil
	}
	var databaseError *pgconn.PgError
	if errors.As(err, &databaseError) && databaseError.ConstraintName == "users_email_unique" {
		return domain.NewError(domain.ErrorEmailTaken)
	}
	return fmt.Errorf("postgres operation: %w", err)
}
