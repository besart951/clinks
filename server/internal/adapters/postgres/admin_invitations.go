package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type AdminInvitationRepository struct {
	pool *pgxpool.Pool
}

func NewAdminInvitationRepository(pool *pgxpool.Pool) *AdminInvitationRepository {
	return &AdminInvitationRepository{pool: pool}
}

func (repository *AdminInvitationRepository) ListInvitations(ctx context.Context, filter domain.InvitationFilter) (domain.Page[domain.Invitation], error) {
	var page domain.Page[domain.Invitation]
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		limit := domain.EffectiveLimit(filter.Limit) + 1
		args := []any{limit}
		query := `SELECT id, tenant_id, email, role, token_hash, expires_at, used_at, created_by FROM invitations`
		conditions := []string{"1=1"}

		if filter.Search != "" {
			conditions = append(conditions, "email ILIKE '%' || $2 || '%'")
			args = append(args, strings.TrimSpace(filter.Search))
		}
		if filter.TenantID != nil {
			idx := len(args) + 1
			conditions = append(conditions, fmt.Sprintf("tenant_id = $%d", idx))
			args = append(args, string(*filter.TenantID))
		}
		switch filter.Status {
		case "pending":
			conditions = append(conditions, "used_at IS NULL AND expires_at > now()")
		case "used":
			conditions = append(conditions, "used_at IS NOT NULL")
		case "expired":
			conditions = append(conditions, "used_at IS NULL AND expires_at <= now()")
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
			return fmt.Errorf("list invitations: %w", err)
		}
		defer rows.Close()

		page.Items = make([]domain.Invitation, 0)
		for rows.Next() {
			var inv domain.Invitation
			if err = rows.Scan(&inv.ID, &inv.TenantID, &inv.Email, &inv.Role, &inv.TokenHash, &inv.ExpiresAt, &inv.UsedAt, &inv.CreatedBy); err != nil {
				return fmt.Errorf("scan invitation: %w", err)
			}
			page.Items = append(page.Items, inv)
		}
		if err = rows.Err(); err != nil {
			return err
		}
		if len(page.Items) == limit {
			page.Items = page.Items[:limit-1]
			page.NextCursor = domain.Cursor(page.Items[len(page.Items)-1].Email)
		}
		return nil
	})
	return page, err
}

func (repository *AdminInvitationRepository) RevokeInvitation(ctx context.Context, id domain.InvitationID) error {
	return withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		result, err := tx.Exec(ctx, "DELETE FROM invitations WHERE id = $1 AND used_at IS NULL", id)
		if err != nil {
			return fmt.Errorf("revoke invitation: %w", err)
		}
		if result.RowsAffected() == 0 {
			return domain.NewError(domain.ErrorInvitationInvalid)
		}
		return nil
	})
}
