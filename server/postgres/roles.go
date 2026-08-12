package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	clinks "github.com/besartmorina/clinks/server"
)

const (
	administratorRoleName = "Administrator"
	userRoleName          = "User"
)

func (store *Store) ListRoles(
	ctx context.Context,
	tenantID clinks.TenantID,
	filter clinks.RoleFilter,
) (clinks.Page[clinks.Role], error) {
	pageSize := clinks.EffectiveLimit(filter.Limit)
	search := strings.TrimSpace(filter.Search)
	fingerprint := keysetFingerprint(strings.ToLower(search), optionalString(filter.Kind), filter.Sort, filter.Direction)
	query := roleSelect + ` WHERE role.tenant_id = @tenant_id`
	arguments := pgx.StrictNamedArgs{"tenant_id": tenantID, "limit": pageSize + 1}
	if search != "" {
		query += ` AND role.name ILIKE '%' || @search || '%'`
		arguments["search"] = search
	}
	if filter.Kind != nil {
		query += ` AND role.kind = @kind`
		arguments["kind"] = *filter.Kind
	}
	sortExpression := "role.name"
	if filter.Sort == clinks.RoleSortCreatedAt {
		sortExpression = "role.created_at"
	}
	operator, order := keysetDirection(filter.Direction)
	if filter.Cursor != "" {
		cursor, err := decodeUUIDKeysetCursor(filter.Cursor, "roles", fingerprint)
		if err != nil {
			return clinks.Page[clinks.Role]{}, clinks.NewError(clinks.ErrorValidation)
		}
		arguments["cursor_id"] = cursor.ID
		if filter.Sort == clinks.RoleSortCreatedAt {
			value, err := time.Parse(time.RFC3339Nano, cursor.SortValue)
			if err != nil {
				return clinks.Page[clinks.Role]{}, clinks.NewError(clinks.ErrorValidation)
			}
			arguments["cursor_sort"] = value
		} else {
			arguments["cursor_sort"] = cursor.SortValue
		}
		query += fmt.Sprintf(" AND (%s, role.id) %s (@cursor_sort, @cursor_id)", sortExpression, operator)
	}
	query += fmt.Sprintf(" GROUP BY role.id ORDER BY %s %s, role.id %s LIMIT @limit", sortExpression, order, order)

	var page clinks.Page[clinks.Role]
	err := WithTenantTx(ctx, store.pool, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, query, arguments)
		if err != nil {
			return fmt.Errorf("list roles: %w", err)
		}

		page.Items, err = pgx.CollectRows(rows, scanRole)
		if err != nil {
			return fmt.Errorf("collect roles: %w", err)
		}

		return nil
	})
	if err != nil {
		return clinks.Page[clinks.Role]{}, err
	}
	if len(page.Items) > pageSize {
		page.Items = page.Items[:pageSize]
		last := page.Items[len(page.Items)-1]
		sortValue := last.Name
		if filter.Sort == clinks.RoleSortCreatedAt {
			sortValue = last.CreatedAt.UTC().Format(time.RFC3339Nano)
		}
		page.NextCursor = encodeKeysetCursor("roles", fingerprint, sortValue, string(last.ID))
	}
	return page, nil
}

func (store *Store) FindRole(
	ctx context.Context,
	tenantID clinks.TenantID,
	roleID clinks.RoleID,
) (clinks.Role, error) {
	var role clinks.Role
	err := WithTenantTx(ctx, store.pool, tenantID, func(tx pgx.Tx) error {
		var err error
		role, err = findRoleTx(ctx, tx, tenantID, roleID)
		return err
	})

	return role, err
}

func (store *Store) PermissionsForRole(
	ctx context.Context,
	tenantID clinks.TenantID,
	roleID clinks.RoleID,
) ([]clinks.Permission, error) {
	role, err := store.FindRole(ctx, tenantID, roleID)
	if err != nil {
		return nil, err
	}

	return role.Permissions, nil
}

func (store *Store) CreateRole(
	ctx context.Context,
	role clinks.Role,
	actorID clinks.UserID,
) (clinks.Role, error) {
	role.Name = strings.TrimSpace(role.Name)
	role.Kind = clinks.RoleKindCustom
	if role.ID == "" {
		id, err := newUUID()
		if err != nil {
			return clinks.Role{}, err
		}
		role.ID = clinks.RoleID(id)
	}

	err := WithTenantTx(ctx, store.pool, role.TenantID, func(tx pgx.Tx) error {
		if err := insertRole(ctx, tx, role); err != nil {
			return constraintConflict(err)
		}
		if err := insertRolePermissions(ctx, tx, role.TenantID, role.ID, role.Permissions); err != nil {
			return err
		}
		var err error
		role, err = findRoleTx(ctx, tx, role.TenantID, role.ID)
		if err != nil {
			return err
		}
		return insertAuditEvent(ctx, tx, clinks.AuditEvent{
			ActorID: new(actorID), TenantID: new(role.TenantID),
			Action: "role.created", Target: role.Name,
		})
	})

	return role, err
}

func (store *Store) UpdateRole(
	ctx context.Context,
	role clinks.Role,
	actorID clinks.UserID,
) (clinks.Role, error) {
	role.Name = strings.TrimSpace(role.Name)
	err := WithTenantTx(ctx, store.pool, role.TenantID, func(tx pgx.Tx) error {
		result, err := tx.Exec(ctx, `
			UPDATE tenant_roles
			SET name = $3, revision = revision + 1, updated_at = now()
			WHERE id = $1 AND tenant_id = $2 AND revision = $4 AND kind = 'custom'
		`, role.ID, role.TenantID, role.Name, role.Revision)
		if err != nil {
			return constraintConflict(fmt.Errorf("update role: %w", err))
		}
		if result.RowsAffected() != 1 {
			return clinks.NewError(clinks.ErrorConflict)
		}

		if _, err := tx.Exec(ctx, `
			DELETE FROM tenant_role_permissions WHERE tenant_id = $1 AND role_id = $2
		`, role.TenantID, role.ID); err != nil {
			return fmt.Errorf("replace role permissions: %w", err)
		}
		if err := insertRolePermissions(ctx, tx, role.TenantID, role.ID, role.Permissions); err != nil {
			return err
		}

		role, err = findRoleTx(ctx, tx, role.TenantID, role.ID)
		if err != nil {
			return err
		}
		return insertAuditEvent(ctx, tx, clinks.AuditEvent{
			ActorID: new(actorID), TenantID: new(role.TenantID),
			Action: "role.updated", Target: role.Name,
		})
	})

	return role, err
}

func (store *Store) DeleteRole(
	ctx context.Context,
	tenantID clinks.TenantID,
	roleID clinks.RoleID,
	revision uint64,
	actorID clinks.UserID,
) error {
	return WithTenantTx(ctx, store.pool, tenantID, func(tx pgx.Tx) error {
		result, err := tx.Exec(ctx, `
			DELETE FROM tenant_roles
			WHERE id = $1 AND tenant_id = $2 AND revision = $3 AND kind = 'custom'
		`, roleID, tenantID, revision)
		if err != nil {
			return constraintConflict(fmt.Errorf("delete role: %w", err))
		}
		if result.RowsAffected() != 1 {
			return clinks.NewError(clinks.ErrorConflict)
		}
		return insertAuditEvent(ctx, tx, clinks.AuditEvent{
			ActorID: new(actorID), TenantID: new(tenantID),
			Action: "role.deleted", Target: string(roleID),
		})
	})
}

type defaultRoles struct {
	Administrator clinks.Role
	User          clinks.Role
}

func createDefaultRoles(
	ctx context.Context,
	tx pgx.Tx,
	tenantID clinks.TenantID,
) (defaultRoles, error) {
	administrator, err := newRole(tenantID, administratorRoleName, clinks.RoleKindAdministrator, clinks.AllPermissions())
	if err != nil {
		return defaultRoles{}, err
	}
	user, err := newRole(tenantID, userRoleName, clinks.RoleKindUser, clinks.DefaultUserPermissions())
	if err != nil {
		return defaultRoles{}, err
	}

	roles := defaultRoles{Administrator: administrator, User: user}
	for _, role := range []clinks.Role{roles.Administrator, roles.User} {
		if err := insertRole(ctx, tx, role); err != nil {
			return defaultRoles{}, err
		}
		if err := insertRolePermissions(ctx, tx, tenantID, role.ID, role.Permissions); err != nil {
			return defaultRoles{}, err
		}
	}

	return roles, nil
}

func newRole(
	tenantID clinks.TenantID,
	name string,
	kind clinks.RoleKind,
	permissions []clinks.Permission,
) (clinks.Role, error) {
	id, err := newUUID()
	if err != nil {
		return clinks.Role{}, err
	}
	return clinks.Role{
		ID:          clinks.RoleID(id),
		TenantID:    tenantID,
		Name:        name,
		Kind:        kind,
		Permissions: permissions,
		Revision:    1,
	}, nil
}

func insertRole(ctx context.Context, tx pgx.Tx, role clinks.Role) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO tenant_roles (id, tenant_id, name, kind)
		VALUES ($1, $2, $3, $4)
	`, role.ID, role.TenantID, role.Name, role.Kind)
	if err != nil {
		return fmt.Errorf("insert role: %w", err)
	}
	return nil
}

func insertRolePermissions(
	ctx context.Context,
	tx pgx.Tx,
	tenantID clinks.TenantID,
	roleID clinks.RoleID,
	permissions []clinks.Permission,
) error {
	seen := make(map[clinks.Permission]struct{}, len(permissions))
	for _, permission := range permissions {
		if !permission.IsValid() {
			return clinks.NewError(clinks.ErrorValidation)
		}
		if _, exists := seen[permission]; exists {
			continue
		}
		seen[permission] = struct{}{}
		if _, err := tx.Exec(ctx, `
			INSERT INTO tenant_role_permissions (tenant_id, role_id, permission)
			VALUES ($1, $2, $3)
		`, tenantID, roleID, permission); err != nil {
			return fmt.Errorf("insert role permission %q: %w", permission, err)
		}
	}
	return nil
}

const roleSelect = `
	SELECT
		role.id,
		role.tenant_id,
		role.name,
		role.kind,
		role.revision,
		role.created_at,
		role.updated_at,
		COALESCE(
			array_agg(permission.permission ORDER BY permission.permission)
				FILTER (WHERE permission.permission IS NOT NULL),
			ARRAY[]::text[]
		)
	FROM tenant_roles role
	LEFT JOIN tenant_role_permissions permission ON permission.role_id = role.id
`

func findRoleTx(
	ctx context.Context,
	tx pgx.Tx,
	tenantID clinks.TenantID,
	roleID clinks.RoleID,
) (clinks.Role, error) {
	role, err := scanRoleValue(tx.QueryRow(ctx, roleSelect+`
		WHERE role.tenant_id = $1 AND role.id = $2
		GROUP BY role.id
	`, tenantID, roleID))
	if err == pgx.ErrNoRows {
		return clinks.Role{}, clinks.NewError(clinks.ErrorRoleNotFound)
	}
	if err != nil {
		return clinks.Role{}, fmt.Errorf("find role: %w", err)
	}
	return role, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanRole(row pgx.CollectableRow) (clinks.Role, error) {
	return scanRoleValue(row)
}

func scanRoleValue(row rowScanner) (clinks.Role, error) {
	var role clinks.Role
	var permissions []string
	err := row.Scan(
		&role.ID,
		&role.TenantID,
		&role.Name,
		&role.Kind,
		&role.Revision,
		&role.CreatedAt,
		&role.UpdatedAt,
		&permissions,
	)
	if err != nil {
		return clinks.Role{}, err
	}
	role.Permissions = make([]clinks.Permission, len(permissions))
	for index, permission := range permissions {
		role.Permissions[index] = clinks.Permission(permission)
	}
	return role, nil
}
