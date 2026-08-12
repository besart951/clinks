package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	clinks "github.com/besartmorina/clinks/server"
)

func (store *Store) MembershipsForUser(
	ctx context.Context,
	userID clinks.UserID,
) ([]clinks.Membership, error) {
	memberships := make([]clinks.Membership, 0)

	err := withSystemTx(ctx, store.pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, membershipQuery+`
			WHERE membership.user_id = $1 AND membership.status = $2
			ORDER BY tenant.name, membership.id`, userID, clinks.MembershipActive)
		if err != nil {
			return fmt.Errorf("list memberships: %w", err)
		}

		memberships, err = pgx.CollectRows(rows, scanMembership)

		return err
	})

	return memberships, err
}

func (store *Store) FindActiveMembership(
	ctx context.Context,
	userID clinks.UserID,
	tenantID clinks.TenantID,
) (clinks.Membership, error) {
	var membership clinks.Membership

	err := WithTenantTx(ctx, store.pool, tenantID, func(tx pgx.Tx) error {
		var err error
		membership, err = scanMembershipValue(tx.QueryRow(ctx, membershipQuery+`
			WHERE membership.user_id = $1
				AND membership.tenant_id = $2
				AND membership.status = $3`, userID, tenantID, clinks.MembershipActive))

		return err
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return clinks.Membership{}, clinks.NewError(clinks.ErrorMembershipNotFound)
	}

	return membership, err
}

func (store *Store) ListMemberships(
	ctx context.Context,
	tenantID clinks.TenantID,
	filter clinks.MembershipFilter,
) (clinks.Page[clinks.Membership], error) {
	pageSize := clinks.EffectiveLimit(filter.Limit)
	search := strings.TrimSpace(filter.Search)
	fingerprint := keysetFingerprint(strings.ToLower(search), optionalString(filter.RoleID), optionalString(filter.Status), filter.Sort, filter.Direction)
	query := membershipQuery + ` WHERE membership.tenant_id = @tenant_id`
	arguments := pgx.StrictNamedArgs{"tenant_id": tenantID, "limit": pageSize + 1}
	if search != "" {
		query += ` AND user_row.email ILIKE '%' || @search || '%'`
		arguments["search"] = search
	}
	if filter.RoleID != nil {
		query += ` AND membership.role_id = @role_id`
		arguments["role_id"] = *filter.RoleID
	}
	if filter.Status != nil {
		query += ` AND membership.status = @status`
		arguments["status"] = *filter.Status
	}
	sortExpression := "user_row.email"
	if filter.Sort == clinks.MembershipSortCreatedAt {
		sortExpression = "membership.created_at"
	}
	operator, order := keysetDirection(filter.Direction)
	if filter.Cursor != "" {
		cursor, err := decodeUUIDKeysetCursor(filter.Cursor, "memberships", fingerprint)
		if err != nil {
			return clinks.Page[clinks.Membership]{}, clinks.NewError(clinks.ErrorValidation)
		}
		arguments["cursor_id"] = cursor.ID
		if filter.Sort == clinks.MembershipSortCreatedAt {
			value, err := time.Parse(time.RFC3339Nano, cursor.SortValue)
			if err != nil {
				return clinks.Page[clinks.Membership]{}, clinks.NewError(clinks.ErrorValidation)
			}
			arguments["cursor_sort"] = value
		} else {
			arguments["cursor_sort"] = cursor.SortValue
		}
		query += fmt.Sprintf(" AND (%s, membership.id) %s (@cursor_sort, @cursor_id)", sortExpression, operator)
	}
	query += fmt.Sprintf(" ORDER BY %s %s, membership.id %s LIMIT @limit", sortExpression, order, order)

	var page clinks.Page[clinks.Membership]
	err := WithTenantTx(ctx, store.pool, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, query, arguments)
		if err != nil {
			return fmt.Errorf("list tenant memberships: %w", err)
		}
		page.Items, err = pgx.CollectRows(rows, scanMembership)
		return err
	})
	if err != nil {
		return clinks.Page[clinks.Membership]{}, err
	}
	if len(page.Items) > pageSize {
		page.Items = page.Items[:pageSize]
		last := page.Items[len(page.Items)-1]
		sortValue := strings.ToLower(string(last.UserEmail))
		if filter.Sort == clinks.MembershipSortCreatedAt {
			sortValue = last.CreatedAt.UTC().Format(time.RFC3339Nano)
		}
		page.NextCursor = encodeKeysetCursor("memberships", fingerprint, sortValue, string(last.ID))
	}
	return page, nil
}

func (store *Store) UpdateMembership(
	ctx context.Context,
	membership clinks.Membership,
	actorID clinks.UserID,
) (clinks.Membership, error) {
	err := WithTenantTx(ctx, store.pool, membership.Tenant.ID, func(tx pgx.Tx) error {
		var err error
		membership, err = updateMembershipTx(ctx, tx, membership, actorID)
		return err
	})
	return membership, err
}

func updateMembershipTx(
	ctx context.Context,
	tx pgx.Tx,
	membership clinks.Membership,
	actorID clinks.UserID,
) (clinks.Membership, error) {
	if err := lockMembershipTenant(ctx, tx, membership.Tenant.ID); err != nil {
		return clinks.Membership{}, err
	}
	userID, currentRoleKind, err := lockMembership(ctx, tx, membership.ID, membership.Tenant.ID)
	if err != nil {
		return clinks.Membership{}, err
	}
	membership.UserID = userID
	targetRoleKind, err := membershipRoleKind(ctx, tx, membership.RoleID, membership.Tenant.ID)
	if err != nil {
		return clinks.Membership{}, err
	}
	if err := protectFinalAdministrator(ctx, tx, membership, currentRoleKind, targetRoleKind); err != nil {
		return clinks.Membership{}, err
	}
	if err := persistMembershipUpdate(ctx, tx, membership); err != nil {
		return clinks.Membership{}, err
	}
	if err := invalidateUserSession(ctx, tx, membership.UserID); err != nil {
		return clinks.Membership{}, err
	}

	updated, err := scanMembershipValue(tx.QueryRow(ctx, membershipQuery+`
		WHERE membership.id = $1 AND membership.tenant_id = $2
	`, membership.ID, membership.Tenant.ID))
	if err != nil {
		return clinks.Membership{}, fmt.Errorf("reload membership: %w", err)
	}
	if err := insertAuditEvent(ctx, tx, clinks.AuditEvent{
		ActorID: new(actorID), TenantID: new(updated.Tenant.ID),
		Action: "membership.updated", Target: string(updated.UserEmail),
	}); err != nil {
		return clinks.Membership{}, err
	}
	return updated, nil
}

func lockMembershipTenant(ctx context.Context, tx pgx.Tx, tenantID clinks.TenantID) error {
	// Serialize mutations so concurrent Administrator demotions cannot both
	// pass the final-Administrator check.
	err := tx.QueryRow(ctx, `SELECT id FROM tenants WHERE id = $1 FOR UPDATE`, tenantID).Scan(new(clinks.TenantID))
	if err == pgx.ErrNoRows {
		return clinks.NewError(clinks.ErrorConflict)
	}
	if err != nil {
		return fmt.Errorf("lock membership tenant: %w", err)
	}
	return nil
}

func lockMembership(
	ctx context.Context,
	tx pgx.Tx,
	membershipID clinks.MembershipID,
	tenantID clinks.TenantID,
) (clinks.UserID, clinks.RoleKind, error) {
	var userID clinks.UserID
	var roleKind clinks.RoleKind
	err := tx.QueryRow(ctx, `
		SELECT membership.user_id, role.kind
		FROM tenant_memberships membership
		JOIN tenant_roles role ON role.id = membership.role_id
		WHERE membership.id = $1 AND membership.tenant_id = $2
		FOR UPDATE OF membership
	`, membershipID, tenantID).Scan(&userID, &roleKind)
	if err == pgx.ErrNoRows {
		return "", "", clinks.NewError(clinks.ErrorMembershipNotFound)
	}
	if err != nil {
		return "", "", fmt.Errorf("lock membership: %w", err)
	}
	return userID, roleKind, nil
}

func membershipRoleKind(ctx context.Context, tx pgx.Tx, roleID clinks.RoleID, tenantID clinks.TenantID) (clinks.RoleKind, error) {
	var kind clinks.RoleKind
	err := tx.QueryRow(ctx, `SELECT kind FROM tenant_roles WHERE id = $1 AND tenant_id = $2`, roleID, tenantID).Scan(&kind)
	if err == pgx.ErrNoRows {
		return "", clinks.NewError(clinks.ErrorRoleNotFound)
	}
	if err != nil {
		return "", fmt.Errorf("find target membership role: %w", err)
	}
	return kind, nil
}

func protectFinalAdministrator(
	ctx context.Context,
	tx pgx.Tx,
	membership clinks.Membership,
	currentRoleKind clinks.RoleKind,
	targetRoleKind clinks.RoleKind,
) error {
	if !removesAdministrator(membership.Status, currentRoleKind, targetRoleKind) {
		return nil
	}
	var otherAdministrators int
	err := tx.QueryRow(ctx, `
		SELECT count(*)
		FROM tenant_memberships other
		JOIN tenant_roles role ON role.id = other.role_id
		WHERE other.tenant_id = $1 AND other.id <> $2
		  AND other.status = 'active' AND role.kind = 'administrator'
	`, membership.Tenant.ID, membership.ID).Scan(&otherAdministrators)
	if err != nil {
		return fmt.Errorf("count tenant administrators: %w", err)
	}
	if otherAdministrators == 0 {
		return clinks.NewError(clinks.ErrorConflict)
	}
	return nil
}

func removesAdministrator(
	status clinks.MembershipStatus,
	currentRoleKind,
	targetRoleKind clinks.RoleKind,
) bool {
	return currentRoleKind == clinks.RoleKindAdministrator &&
		(status != clinks.MembershipActive || targetRoleKind != clinks.RoleKindAdministrator)
}

func persistMembershipUpdate(ctx context.Context, tx pgx.Tx, membership clinks.Membership) error {
	result, err := tx.Exec(ctx, `
		UPDATE tenant_memberships
		SET role_id = $3, status = $4, revision = revision + 1, updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND revision = $5
	`, membership.ID, membership.Tenant.ID, membership.RoleID, membership.Status, membership.Revision)
	if err != nil {
		return fmt.Errorf("update membership: %w", err)
	}
	if result.RowsAffected() != 1 {
		return clinks.NewError(clinks.ErrorConflict)
	}
	return nil
}

func invalidateUserSession(ctx context.Context, tx pgx.Tx, userID clinks.UserID) error {
	_, err := tx.Exec(ctx, `
		UPDATE users SET session_version = session_version + 1, updated_at = now()
		WHERE id = $1
	`, userID)
	if err != nil {
		return fmt.Errorf("invalidate changed membership session: %w", err)
	}
	return nil
}

const membershipQuery = `
	SELECT
		membership.id,
		membership.user_id,
		user_row.email,
		tenant.id,
		tenant.name,
		tenant.revision,
		role.id,
		role.tenant_id,
		role.name,
		role.kind,
		role.revision,
		role.created_at,
		role.updated_at,
		permission.permissions,
		membership.status,
		membership.revision,
		membership.created_at,
		membership.updated_at
	FROM tenant_memberships membership
	JOIN tenants tenant ON tenant.id = membership.tenant_id
	JOIN tenant_roles role ON role.id = membership.role_id
	JOIN users user_row ON user_row.id = membership.user_id
	LEFT JOIN LATERAL (
		SELECT COALESCE(array_agg(value.permission ORDER BY value.permission), ARRAY[]::text[]) AS permissions
		FROM tenant_role_permissions value
		WHERE value.role_id = role.id
	) permission ON true
`

type membershipScanner interface {
	Scan(...any) error
}

func scanMembership(row pgx.CollectableRow) (clinks.Membership, error) {
	return scanMembershipValue(row)
}

func scanMembershipValue(scanner membershipScanner) (clinks.Membership, error) {
	var membership clinks.Membership
	var permissions []string

	err := scanner.Scan(
		&membership.ID,
		&membership.UserID,
		&membership.UserEmail,
		&membership.Tenant.ID,
		&membership.Tenant.Name,
		&membership.Tenant.Revision,
		&membership.Role.ID,
		&membership.Role.TenantID,
		&membership.Role.Name,
		&membership.Role.Kind,
		&membership.Role.Revision,
		&membership.Role.CreatedAt,
		&membership.Role.UpdatedAt,
		&permissions,
		&membership.Status,
		&membership.Revision,
		&membership.CreatedAt,
		&membership.UpdatedAt,
	)
	membership.RoleID = membership.Role.ID
	membership.Role.Permissions = make([]clinks.Permission, len(permissions))
	for index, permission := range permissions {
		membership.Role.Permissions[index] = clinks.Permission(permission)
	}

	return membership, err
}
