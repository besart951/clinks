package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type RoleReader interface {
	ListRoles(
		ctx context.Context,
		tenantID domain.TenantID,
		filter domain.RoleFilter,
	) (domain.Page[domain.Role], error)

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

type RoleLookup interface {
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
		actorID domain.UserID,
	) (domain.Role, error)

	UpdateRole(
		ctx context.Context,
		role domain.Role,
		actorID domain.UserID,
	) (domain.Role, error)

	DeleteRole(
		ctx context.Context,
		tenantID domain.TenantID,
		roleID domain.RoleID,
		revision uint64,
		actorID domain.UserID,
	) error
}

type RoleRepository interface {
	RoleReader
	RoleEditor
}
