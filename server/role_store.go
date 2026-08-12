package clinks

import (
	"context"
)

type RoleReader interface {
	ListRoles(
		ctx context.Context,
		tenantID TenantID,
		filter RoleFilter,
	) (Page[Role], error)

	FindRole(
		ctx context.Context,
		tenantID TenantID,
		roleID RoleID,
	) (Role, error)

	PermissionsForRole(
		ctx context.Context,
		tenantID TenantID,
		roleID RoleID,
	) ([]Permission, error)
}

type RoleLookup interface {
	FindRole(
		ctx context.Context,
		tenantID TenantID,
		roleID RoleID,
	) (Role, error)

	PermissionsForRole(
		ctx context.Context,
		tenantID TenantID,
		roleID RoleID,
	) ([]Permission, error)
}

type RoleEditor interface {
	CreateRole(
		ctx context.Context,
		role Role,
		actorID UserID,
	) (Role, error)

	UpdateRole(
		ctx context.Context,
		role Role,
		actorID UserID,
	) (Role, error)

	DeleteRole(
		ctx context.Context,
		tenantID TenantID,
		roleID RoleID,
		revision uint64,
		actorID UserID,
	) error
}

type RoleStore interface {
	RoleReader
	RoleEditor
}
