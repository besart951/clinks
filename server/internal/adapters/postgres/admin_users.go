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

func NewAdminUserRepository(pool *pgxpool.Pool) *AdminUserRepository {
	return &AdminUserRepository{pool: pool}
}

func (repository *AdminUserRepository) ListUsers(ctx context.Context, filter domain.UserFilter) (domain.Page[domain.UserSummary], error) {
	var page domain.Page[domain.UserSummary]
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		return listUsersTx(ctx, tx, filter, &page)
	})
	return page, err
}

func (repository *AdminUserRepository) GetUser(ctx context.Context, id domain.UserID) (domain.UserDetail, error) {
	var detail domain.UserDetail
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		var err error
		detail.User, err = scanUser(ctx, tx, id)
		if err != nil {
			return err
		}
		detail.Memberships, err = listUserMemberships(ctx, tx, id)
		return err
	})
	return detail, err
}

func listUsersTx(ctx context.Context, tx pgx.Tx, filter domain.UserFilter, page *domain.Page[domain.UserSummary]) error {
	limit := domain.EffectiveLimit(filter.Limit) + 1
	args := []any{limit}

	query := `SELECT id, email, locale, global_role,
		(SELECT COUNT(*) FROM tenant_memberships WHERE user_id = users.id AND status = 'ACTIVE') AS membership_count
		FROM users`
	conditions := []string{"1=1"}

	if filter.Search != "" {
		conditions = append(conditions, "email ILIKE '%' || $2 || '%'")
		args = append(args, strings.TrimSpace(filter.Search))
	}
	if filter.Role != nil {
		idx := len(args) + 1
		conditions = append(conditions, fmt.Sprintf("global_role = $%d", idx))
		args = append(args, string(*filter.Role))
	}
	if filter.Cursor != "" {
		idx := len(args) + 1
		conditions = append(conditions, fmt.Sprintf("email > $%d", idx))
		args = append(args, string(filter.Cursor))
	}

	query += " WHERE " + conditions[0]
	for _, condition := range conditions[1:] {
		query += " AND " + condition
	}
	query += fmt.Sprintf(" ORDER BY email LIMIT $1")

	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	page.Items = make([]domain.UserSummary, 0)
	for rows.Next() {
		var summary domain.UserSummary
		var role domain.Role
		if err = rows.Scan(&summary.ID, &summary.Email, &summary.Locale, &role, &summary.MembershipCount); err != nil {
			return fmt.Errorf("scan user summary: %w", err)
		}
		summary.IsSuperAdmin = role.IsSuperAdmin()
		page.Items = append(page.Items, summary)
	}
	if err = rows.Err(); err != nil {
		return err
	}
	if len(page.Items) == limit {
		page.Items = page.Items[:limit-1]
		page.NextCursor = domain.Cursor(page.Items[len(page.Items)-1].Email)
	}
	return nil
}

func scanUser(ctx context.Context, tx pgx.Tx, id domain.UserID) (domain.User, error) {
	var user domain.User
	err := tx.QueryRow(ctx, `SELECT id, email, global_role, locale, session_version FROM users WHERE id = $1`, id).
		Scan(&user.ID, &user.Email, &user.Role, &user.Locale, &user.SessionVersion)
	if err != nil {
		if err == pgx.ErrNoRows {
			return domain.User{}, domain.NewError(domain.ErrorTenantNotFound)
		}
		return domain.User{}, fmt.Errorf("find user: %w", err)
	}
	return user, nil
}

func listUserMemberships(ctx context.Context, tx pgx.Tx, userID domain.UserID) ([]domain.Membership, error) {
	rows, err := tx.Query(ctx, membershipQuery+` WHERE membership.user_id = $1 AND membership.status = $2 ORDER BY tenant.name`, userID, domain.MembershipActive)
	if err != nil {
		return nil, fmt.Errorf("list user memberships: %w", err)
	}
	defer rows.Close()
	memberships := make([]domain.Membership, 0)
	for rows.Next() {
		membership, scanErr := scanMembership(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		memberships = append(memberships, membership)
	}
	return memberships, rows.Err()
}
