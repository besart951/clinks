package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type AdminUserRepository struct {
	pool *pgxpool.Pool
}

func NewAdminUserRepository(
	pool *pgxpool.Pool,
) *AdminUserRepository {
	return &AdminUserRepository{
		pool: pool,
	}
}

func (repository *AdminUserRepository) ListUsers(
	ctx context.Context,
	filter domain.UserFilter,
) (domain.Page[domain.UserSummary], error) {
	var page domain.Page[domain.UserSummary]

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			var err error
			page, err = listUsersTx(
				ctx,
				tx,
				filter,
			)

			return err
		},
	)

	return page, err
}

func (repository *AdminUserRepository) GetUser(
	ctx context.Context,
	userID domain.UserID,
) (domain.UserDetail, error) {
	var detail domain.UserDetail

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			user, err := scanUser(
				ctx,
				tx,
				userID,
			)
			if err != nil {
				return err
			}

			memberships, err := listUserMemberships(
				ctx,
				tx,
				userID,
			)
			if err != nil {
				return err
			}

			detail = domain.UserDetail{
				User:        user,
				Memberships: memberships,
			}

			return nil
		},
	)

	return detail, err
}

func listUsersTx(
	ctx context.Context,
	tx pgx.Tx,
	filter domain.UserFilter,
) (domain.Page[domain.UserSummary], error) {
	pageSize := domain.EffectiveLimit(filter.Limit)
	queryLimit := pageSize + 1

	query := `
		SELECT
			users.id,
			users.email,
			users.locale,
			users.is_super_admin,
			(
				SELECT COUNT(*)
				FROM tenant_memberships membership
				WHERE
					membership.user_id = users.id
					AND membership.status = @active_status
			) AS membership_count
		FROM users
		WHERE TRUE
	`

	arguments := pgx.StrictNamedArgs{
		"active_status": domain.MembershipActive,
		"limit":         queryLimit,
	}

	search := strings.TrimSpace(filter.Search)
	if search != "" {
		query += `
			AND users.email ILIKE '%' || @search || '%'
		`
		arguments["search"] = search
	}

	if filter.IsSuperAdmin != nil {
		query += `
			AND users.is_super_admin = @is_super_admin
		`
		arguments["is_super_admin"] =
			*filter.IsSuperAdmin
	}

	if filter.Cursor != "" {
		query += `
			AND users.email > @cursor
		`
		arguments["cursor"] = string(filter.Cursor)
	}

	query += `
		ORDER BY users.email
		LIMIT @limit
	`

	rows, err := tx.Query(
		ctx,
		query,
		arguments,
	)
	if err != nil {
		return domain.Page[domain.UserSummary]{},
			fmt.Errorf("list users: %w", err)
	}

	items, err := pgx.CollectRows(
		rows,
		scanUserSummary,
	)
	if err != nil {
		return domain.Page[domain.UserSummary]{},
			fmt.Errorf(
				"collect user summaries: %w",
				err,
			)
	}

	page := domain.Page[domain.UserSummary]{
		Items: items,
	}

	if len(page.Items) > pageSize {
		page.Items = page.Items[:pageSize]

		page.NextCursor = domain.Cursor(
			page.Items[len(page.Items)-1].Email,
		)
	}

	return page, nil
}

func scanUserSummary(
	row pgx.CollectableRow,
) (domain.UserSummary, error) {
	var summary domain.UserSummary
	var membershipCount int64

	err := row.Scan(
		&summary.ID,
		&summary.Email,
		&summary.Locale,
		&summary.IsSuperAdmin,
		&membershipCount,
	)
	if err != nil {
		return domain.UserSummary{}, err
	}

	summary.MembershipCount = int(membershipCount)

	return summary, nil
}

func scanUser(
	ctx context.Context,
	tx pgx.Tx,
	userID domain.UserID,
) (domain.User, error) {
	var user domain.User

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
		return domain.User{},
			domain.NewError(domain.ErrorUserNotFound)
	}

	if err != nil {
		return domain.User{},
			fmt.Errorf("find user: %w", err)
	}

	return user, nil
}

func listUserMemberships(
	ctx context.Context,
	tx pgx.Tx,
	userID domain.UserID,
) ([]domain.Membership, error) {
	rows, err := tx.Query(
		ctx,
		membershipQuery+`
			WHERE
				membership.user_id = $1
				AND membership.status = $2
			ORDER BY tenant.name, membership.id
		`,
		userID,
		domain.MembershipActive,
	)
	if err != nil {
		return nil,
			fmt.Errorf(
				"list user memberships: %w",
				err,
			)
	}

	memberships, err := pgx.CollectRows(
		rows,
		scanMembership,
	)
	if err != nil {
		return nil,
			fmt.Errorf(
				"collect user memberships: %w",
				err,
			)
	}

	return memberships, nil
}
