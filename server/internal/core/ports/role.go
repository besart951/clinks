package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type RoleReader interface {
	ListRoles(
		ctx context.Context,
		tenantID domain.TenantID,
	) ([]domain.Role, error)

	FindRole(
		ctx context.Context,
		tenantID domain.TenantID,
		roleID domain.RoleID,
	) (domain.Role, error)

	PermissionsForRole(
		ctx context.Context,
		tenantID domain.TenantID,
		roleID domain.RoleID,
	) ([]domain.Permission, error)
}

type RoleEditor interface {
	CreateRole(
		ctx context.Context,
		role domain.Role,
		permissions []domain.Permission,
	) (domain.Role, error)

	UpdateRole(
		ctx context.Context,
		role domain.Role,
	) error

	ReplaceRolePermissions(
		ctx context.Context,
		tenantID domain.TenantID,
		roleID domain.RoleID,
		permissions []domain.Permission,
	) error

	DeleteRole(
		ctx context.Context,
		tenantID domain.TenantID,
		roleID domain.RoleID,
	) error
}

type RoleRepository interface {
	RoleReader
	RoleEditor
}
