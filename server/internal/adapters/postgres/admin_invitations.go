package postgres

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type AdminInvitationRepository struct {
	pool *pgxpool.Pool
}

func NewAdminInvitationRepository(
	pool *pgxpool.Pool,
) *AdminInvitationRepository {
	return &AdminInvitationRepository{
		pool: pool,
	}
}

func (repository *AdminInvitationRepository) ListInvitations(
	ctx context.Context,
	filter domain.InvitationFilter,
) (domain.Page[domain.Invitation], error) {
	var page domain.Page[domain.Invitation]

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			var err error
			page, err = listInvitationsTx(
				ctx,
				tx,
				filter,
			)

			return err
		},
	)

	return page, err
}

func (repository *AdminInvitationRepository) RevokeInvitation(
	ctx context.Context,
	invitationID domain.InvitationID,
) error {
	return withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			result, err := tx.Exec(
				ctx,
				`
					DELETE FROM invitations
					WHERE
						id = $1
						AND used_at IS NULL
				`,
				invitationID,
			)
			if err != nil {
				return fmt.Errorf(
					"revoke invitation: %w",
					err,
				)
			}

			if result.RowsAffected() != 1 {
				return domain.NewError(
					domain.ErrorInvitationInvalid,
				)
			}

			return nil
		},
	)
}

type adminInvitationRow struct {
	Invitation domain.Invitation
	CreatedAt  time.Time
}

func listInvitationsTx(
	ctx context.Context,
	tx pgx.Tx,
	filter domain.InvitationFilter,
) (domain.Page[domain.Invitation], error) {
	pageSize := domain.EffectiveLimit(filter.Limit)

	query := `
		SELECT
			invitation.id,
			invitation.tenant_id,
			invitation.email,
			invitation.role_id,
			invitation.token_hash,
			invitation.expires_at,
			invitation.used_at,
			invitation.created_by,
			invitation.delivery_status,
			invitation.created_at
		FROM invitations invitation
		WHERE TRUE
	`

	arguments := pgx.StrictNamedArgs{
		"limit": pageSize + 1,
	}

	search := strings.TrimSpace(filter.Search)
	if search != "" {
		query += `
			AND invitation.email ILIKE '%' || @search || '%'
		`
		arguments["search"] = search
	}

	if filter.TenantID != nil {
		query += `
			AND invitation.tenant_id = @tenant_id
		`
		arguments["tenant_id"] = *filter.TenantID
	}

	switch filter.Status {
	case domain.InvitationStatusFilterAll:

	case domain.InvitationStatusFilterPending:
		query += `
			AND invitation.used_at IS NULL
			AND invitation.expires_at > now()
		`

	case domain.InvitationStatusFilterUsed:
		query += `
			AND invitation.used_at IS NOT NULL
		`

	case domain.InvitationStatusFilterExpired:
		query += `
			AND invitation.used_at IS NULL
			AND invitation.expires_at <= now()
		`

	default:
		return domain.Page[domain.Invitation]{},
			domain.NewError(domain.ErrorValidation)
	}

	if filter.Cursor != "" {
		cursor, err := parseInvitationListCursor(
			filter.Cursor,
		)
		if err != nil {
			return domain.Page[domain.Invitation]{},
				domain.NewError(
					domain.ErrorValidation,
				)
		}

		query += `
			AND (
				invitation.created_at,
				invitation.id
			) < (
				@cursor_created_at,
				@cursor_id
			)
		`

		arguments["cursor_created_at"] =
			cursor.CreatedAt
		arguments["cursor_id"] = cursor.ID
	}

	query += `
		ORDER BY
			invitation.created_at DESC,
			invitation.id DESC
		LIMIT @limit
	`

	rows, err := tx.Query(
		ctx,
		query,
		arguments,
	)
	if err != nil {
		return domain.Page[domain.Invitation]{},
			fmt.Errorf(
				"list invitations: %w",
				err,
			)
	}

	result, err := pgx.CollectRows(
		rows,
		scanAdminInvitation,
	)
	if err != nil {
		return domain.Page[domain.Invitation]{},
			fmt.Errorf(
				"collect invitations: %w",
				err,
			)
	}

	hasNextPage := len(result) > pageSize
	if hasNextPage {
		result = result[:pageSize]
	}

	page := domain.Page[domain.Invitation]{
		Items: make(
			[]domain.Invitation,
			len(result),
		),
	}

	for index, row := range result {
		page.Items[index] = row.Invitation
	}

	if hasNextPage {
		last := result[len(result)-1]

		page.NextCursor = invitationListCursor{
			CreatedAt: last.CreatedAt,
			ID:        last.Invitation.ID,
		}.encode()
	}

	return page, nil
}

func scanAdminInvitation(
	row pgx.CollectableRow,
) (adminInvitationRow, error) {
	var result adminInvitationRow

	err := row.Scan(
		&result.Invitation.ID,
		&result.Invitation.TenantID,
		&result.Invitation.Email,
		&result.Invitation.RoleID,
		&result.Invitation.TokenHash,
		&result.Invitation.ExpiresAt,
		&result.Invitation.UsedAt,
		&result.Invitation.CreatedBy,
		&result.Invitation.DeliveryStatus,
		&result.CreatedAt,
	)

	return result, err
}

type invitationListCursor struct {
	CreatedAt time.Time           `json:"created_at"`
	ID        domain.InvitationID `json:"id"`
}

func (cursor invitationListCursor) encode() domain.Cursor {
	value, err := json.Marshal(cursor)
	if err != nil {
		panic("marshal invitation cursor: " + err.Error())
	}

	return domain.Cursor(
		base64.RawURLEncoding.EncodeToString(value),
	)
}

func parseInvitationListCursor(
	cursor domain.Cursor,
) (invitationListCursor, error) {
	value, err := base64.RawURLEncoding.DecodeString(
		string(cursor),
	)
	if err != nil {
		return invitationListCursor{}, err
	}

	var parsed invitationListCursor

	if err := json.Unmarshal(
		value,
		&parsed,
	); err != nil {
		return invitationListCursor{}, err
	}

	if parsed.CreatedAt.IsZero() ||
		parsed.ID == "" {
		return invitationListCursor{},
			fmt.Errorf("invalid invitation cursor")
	}

	return parsed, nil
}
