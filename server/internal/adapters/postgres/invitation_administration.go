package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func (repository *Store) ListInvitations(
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

func (repository *Store) RevokeInvitation(
	ctx context.Context,
	invitationID domain.InvitationID,
	actorID domain.UserID,
) error {
	return withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error { return revokeInvitationTx(ctx, tx, invitationID, actorID) },
	)
}

func (repository *Store) ListTenantInvitations(
	ctx context.Context,
	tenantID domain.TenantID,
	filter domain.InvitationFilter,
) (domain.Page[domain.Invitation], error) {
	filter.TenantID = new(tenantID)
	var page domain.Page[domain.Invitation]
	err := WithTenantTx(ctx, repository.pool, tenantID, func(tx pgx.Tx) error {
		var err error
		page, err = listInvitationsTx(ctx, tx, filter)
		return err
	})
	return page, err
}

func (repository *Store) RevokeTenantInvitation(
	ctx context.Context,
	tenantID domain.TenantID,
	invitationID domain.InvitationID,
	actorID domain.UserID,
) error {
	return WithTenantTx(ctx, repository.pool, tenantID, func(tx pgx.Tx) error {
		return revokeInvitationTx(ctx, tx, invitationID, actorID)
	})
}

func revokeInvitationTx(ctx context.Context, tx pgx.Tx, invitationID domain.InvitationID, actorID domain.UserID) error {
	var tenantID domain.TenantID
	var email domain.Email
	err := tx.QueryRow(ctx, `
		UPDATE invitations SET revoked_at = now()
		WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL
		RETURNING tenant_id, email
	`, invitationID).Scan(&tenantID, &email)
	if err == pgx.ErrNoRows {
		return domain.NewError(domain.ErrorInvitationInvalid)
	}
	if err != nil {
		return fmt.Errorf("revoke invitation: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE outbox_jobs
		SET status = 'dead_letter', locked_at = NULL, lease_token = NULL,
			dead_lettered_at = now(), updated_at = now(), last_error = 'invitation revoked'
		WHERE invitation_id = $1 AND status IN ('pending', 'processing')
	`, invitationID); err != nil {
		return fmt.Errorf("cancel revoked invitation delivery: %w", err)
	}
	return insertAuditEvent(ctx, tx, domain.AuditEvent{
		ActorID: new(actorID), TenantID: new(tenantID), Action: "invitation.revoked", Target: string(email),
	})
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
	fingerprint := keysetFingerprint(strings.ToLower(strings.TrimSpace(filter.Search)), optionalString(filter.TenantID), filter.Status, filter.Sort, filter.Direction)

	query := `
		SELECT
			invitation.id,
			invitation.tenant_id,
			invitation.email,
			invitation.role_id,
			COALESCE(invitation.token_hash, ''),
			invitation.expires_at,
			invitation.used_at,
			invitation.revoked_at,
			invitation.created_by,
			invitation.delivery_status,
			invitation.delivery_locale,
			role.id,
			role.tenant_id,
			role.name,
			role.kind,
			role.revision,
			role.created_at,
			role.updated_at,
			permission.permissions,
			invitation.created_at
		FROM invitations invitation
		JOIN tenant_roles role ON role.id = invitation.role_id
		LEFT JOIN LATERAL (
			SELECT COALESCE(array_agg(value.permission ORDER BY value.permission), ARRAY[]::text[]) AS permissions
			FROM tenant_role_permissions value WHERE value.role_id = role.id
		) permission ON true
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
			AND invitation.revoked_at IS NULL
			AND invitation.expires_at > now()
		`

	case domain.InvitationStatusFilterUsed:
		query += `
			AND invitation.used_at IS NOT NULL
		`

	case domain.InvitationStatusFilterExpired:
		query += `
			AND invitation.used_at IS NULL
			AND invitation.revoked_at IS NULL
			AND invitation.expires_at <= now()
		`

	case domain.InvitationStatusFilterRevoked:
		query += `
			AND invitation.revoked_at IS NOT NULL
		`

	default:
		return domain.Page[domain.Invitation]{},
			domain.NewError(domain.ErrorValidation)
	}

	sortExpression := "invitation.created_at"
	switch filter.Sort {
	case domain.InvitationSortEmail:
		sortExpression = "invitation.email"
	case domain.InvitationSortExpiresAt:
		sortExpression = "invitation.expires_at"
	}
	operator, order := keysetDirection(filter.Direction)
	if filter.Cursor != "" {
		cursor, err := decodeUUIDKeysetCursor(filter.Cursor, "invitations", fingerprint)
		if err != nil {
			return domain.Page[domain.Invitation]{},
				domain.NewError(
					domain.ErrorValidation,
				)
		}

		query += fmt.Sprintf(" AND (%s, invitation.id) %s (@cursor_sort, @cursor_id)", sortExpression, operator)
		switch filter.Sort {
		case domain.InvitationSortEmail:
			arguments["cursor_sort"] = cursor.SortValue
		default:
			value, err := time.Parse(time.RFC3339Nano, cursor.SortValue)
			if err != nil {
				return domain.Page[domain.Invitation]{}, domain.NewError(domain.ErrorValidation)
			}
			arguments["cursor_sort"] = value
		}
		arguments["cursor_id"] = cursor.ID
	}

	query += fmt.Sprintf(" ORDER BY %s %s, invitation.id %s LIMIT @limit", sortExpression, order, order)

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
		row.Invitation.CreatedAt = row.CreatedAt
		page.Items[index] = row.Invitation
	}

	if hasNextPage {
		last := result[len(result)-1]

		sortValue := last.CreatedAt.UTC().Format(time.RFC3339Nano)
		switch filter.Sort {
		case domain.InvitationSortEmail:
			sortValue = string(last.Invitation.Email)
		case domain.InvitationSortExpiresAt:
			sortValue = last.Invitation.ExpiresAt.UTC().Format(time.RFC3339Nano)
		}
		page.NextCursor = encodeKeysetCursor("invitations", fingerprint, sortValue, string(last.Invitation.ID))
	}

	return page, nil
}

func scanAdminInvitation(
	row pgx.CollectableRow,
) (adminInvitationRow, error) {
	var result adminInvitationRow
	var permissions []string

	err := row.Scan(
		&result.Invitation.ID,
		&result.Invitation.TenantID,
		&result.Invitation.Email,
		&result.Invitation.RoleID,
		&result.Invitation.TokenHash,
		&result.Invitation.ExpiresAt,
		&result.Invitation.UsedAt,
		&result.Invitation.RevokedAt,
		&result.Invitation.CreatedBy,
		&result.Invitation.DeliveryStatus,
		&result.Invitation.Locale,
		&result.Invitation.Role.ID,
		&result.Invitation.Role.TenantID,
		&result.Invitation.Role.Name,
		&result.Invitation.Role.Kind,
		&result.Invitation.Role.Revision,
		&result.Invitation.Role.CreatedAt,
		&result.Invitation.Role.UpdatedAt,
		&permissions,
		&result.CreatedAt,
	)
	result.Invitation.Role.Permissions = make([]domain.Permission, len(permissions))
	for index, permission := range permissions {
		result.Invitation.Role.Permissions[index] = domain.Permission(permission)
	}

	return result, err
}
