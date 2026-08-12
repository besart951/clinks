package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type RoleRepository struct {
	pool *pgxpool.Pool
}

func NewRoleRepository(
	pool *pgxpool.Pool,
) *RoleRepository {
	return &RoleRepository{
		pool: pool,
	}
}

func (repository *RoleRepository) ListRoles(
	ctx context.Context,
	tenantID domain.TenantID,
) ([]domain.Role, error) {
	var roles []domain.Role

	err := WithTenantTx(
		ctx,
		repository.pool,
		tenantID,
		func(tx pgx.Tx) error {
			rows, err := tx.Query(
				ctx,
				`
					SELECT
						id,
						tenant_id,
						name,
						created_at,
						updated_at
					FROM tenant_roles
					WHERE tenant_id = $1
					ORDER BY name, id
				`,
				tenantID,
			)
			if err != nil {
				return fmt.Errorf(
					"list roles: %w",
					err,
				)
			}

			roles, err = pgx.CollectRows(
				rows,
				scanRole,
			)

			return err
		},
	)

	return roles, err
}

func (repository *RoleRepository) FindRole(
	ctx context.Context,
	tenantID domain.TenantID,
	roleID domain.RoleID,
) (domain.Role, error) {
	var role domain.Role

	err := WithTenantTx(
		ctx,
		repository.pool,
		tenantID,
		func(tx pgx.Tx) error {
			err := tx.QueryRow(
				ctx,
				`
					SELECT
						id,
						tenant_id,
						name,
						created_at,
						updated_at
					FROM tenant_roles
					WHERE
						id = $1
						AND tenant_id = $2
				`,
				roleID,
				tenantID,
			).Scan(
				&role.ID,
				&role.TenantID,
				&role.Name,
				&role.CreatedAt,
				&role.UpdatedAt,
			)

			return err
		},
	)

	if err == pgx.ErrNoRows {
		return domain.Role{},
			domain.NewError(domain.ErrorRoleNotFound)
	}

	if err != nil {
		return domain.Role{},
			fmt.Errorf("find role: %w", err)
	}

	return role, nil
}

func (repository *RoleRepository) PermissionsForRole(
	ctx context.Context,
	tenantID domain.TenantID,
	roleID domain.RoleID,
) ([]domain.Permission, error) {
	var permissions []domain.Permission

	err := WithTenantTx(
		ctx,
		repository.pool,
		tenantID,
		func(tx pgx.Tx) error {
			rows, err := tx.Query(
				ctx,
				`
					SELECT permission
					FROM tenant_role_permissions
					WHERE
						tenant_id = $1
						AND role_id = $2
					ORDER BY permission
				`,
				tenantID,
				roleID,
			)
			if err != nil {
				return fmt.Errorf(
					"list role permissions: %w",
					err,
				)
			}

			permissions, err = pgx.CollectRows(
				rows,
				pgx.RowTo[domain.Permission],
			)

			return err
		},
	)

	return permissions, err
}

func (repository *RoleRepository) CreateRole(
	ctx context.Context,
	role domain.Role,
	permissions []domain.Permission,
) (domain.Role, error) {
	role.Name = strings.TrimSpace(role.Name)

	if role.ID == "" {
		id, err := newUUID()
		if err != nil {
			return domain.Role{}, err
		}

		role.ID = domain.RoleID(id)
	}

	err := WithTenantTx(
		ctx,
		repository.pool,
		role.TenantID,
		func(tx pgx.Tx) error {
			err := tx.QueryRow(
				ctx,
				`
					INSERT INTO tenant_roles (
						id,
						tenant_id,
						name
					)
					VALUES ($1, $2, $3)
					RETURNING created_at, updated_at
				`,
				role.ID,
				role.TenantID,
				role.Name,
			).Scan(
				&role.CreatedAt,
				&role.UpdatedAt,
			)
			if err != nil {
				return fmt.Errorf(
					"create role: %w",
					err,
				)
			}

			return insertRolePermissions(
				ctx,
				tx,
				role.TenantID,
				role.ID,
				permissions,
			)
		},
	)

	return role, err
}

func (repository *RoleRepository) UpdateRole(
	ctx context.Context,
	role domain.Role,
) error {
	role.Name = strings.TrimSpace(role.Name)

	return WithTenantTx(
		ctx,
		repository.pool,
		role.TenantID,
		func(tx pgx.Tx) error {
			result, err := tx.Exec(
				ctx,
				`
					UPDATE tenant_roles
					SET
						name = $3,
						updated_at = now()
					WHERE
						id = $1
						AND tenant_id = $2
				`,
				role.ID,
				role.TenantID,
				role.Name,
			)
			if err != nil {
				return fmt.Errorf(
					"update role: %w",
					err,
				)
			}

			if result.RowsAffected() != 1 {
				return domain.NewError(
					domain.ErrorRoleNotFound,
				)
			}

			return nil
		},
	)
}

func (repository *RoleRepository) ReplaceRolePermissions(
	ctx context.Context,
	tenantID domain.TenantID,
	roleID domain.RoleID,
	permissions []domain.Permission,
) error {
	return WithTenantTx(
		ctx,
		repository.pool,
		tenantID,
		func(tx pgx.Tx) error {
			result, err := tx.Exec(
				ctx,
				`
					DELETE FROM tenant_role_permissions
					WHERE
						tenant_id = $1
						AND role_id = $2
				`,
				tenantID,
				roleID,
			)
			if err != nil {
				return fmt.Errorf(
					"delete role permissions: %w",
					err,
				)
			}

			_ = result

			return insertRolePermissions(
				ctx,
				tx,
				tenantID,
				roleID,
				permissions,
			)
		},
	)
}

func (repository *RoleRepository) DeleteRole(
	ctx context.Context,
	tenantID domain.TenantID,
	roleID domain.RoleID,
) error {
	return WithTenantTx(
		ctx,
		repository.pool,
		tenantID,
		func(tx pgx.Tx) error {
			result, err := tx.Exec(
				ctx,
				`
					DELETE FROM tenant_roles
					WHERE
						id = $1
						AND tenant_id = $2
				`,
				roleID,
				tenantID,
			)
			if err != nil {
				return fmt.Errorf(
					"delete role: %w",
					err,
				)
			}

			if result.RowsAffected() != 1 {
				return domain.NewError(
					domain.ErrorRoleNotFound,
				)
			}

			return nil
		},
	)
}

func insertRolePermissions(
	ctx context.Context,
	tx pgx.Tx,
	tenantID domain.TenantID,
	roleID domain.RoleID,
	permissions []domain.Permission,
) error {
	for _, permission := range permissions {
		if !permission.IsValid() {
			return domain.NewError(
				domain.ErrorValidation,
			)
		}

		if _, err := tx.Exec(
			ctx,
			`
				INSERT INTO tenant_role_permissions (
					tenant_id,
					role_id,
					permission
				)
				VALUES ($1, $2, $3)
				ON CONFLICT DO NOTHING
			`,
			tenantID,
			roleID,
			permission,
		); err != nil {
			return fmt.Errorf(
				"insert role permission %q: %w",
				permission,
				err,
			)
		}
	}

	return nil
}

func scanRole(
	row pgx.CollectableRow,
) (domain.Role, error) {
	var role domain.Role

	err := row.Scan(
		&role.ID,
		&role.TenantID,
		&role.Name,
		&role.CreatedAt,
		&role.UpdatedAt,
	)

	return role, err
}
