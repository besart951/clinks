package clinks

type Permission string

const (
	PermissionTenantRead   Permission = "tenant.read"
	PermissionTenantManage Permission = "tenant.manage"

	PermissionUserRead   Permission = "user.read"
	PermissionUserManage Permission = "user.manage"

	PermissionProjectRead   Permission = "project.read"
	PermissionProjectCreate Permission = "project.create"
	PermissionProjectEdit   Permission = "project.edit"
	PermissionProjectDelete Permission = "project.delete"

	PermissionRoleRead   Permission = "role.read"
	PermissionRoleManage Permission = "role.manage"
)

func (permission Permission) IsValid() bool {
	switch permission {
	case PermissionTenantRead,
		PermissionTenantManage,
		PermissionUserRead,
		PermissionUserManage,
		PermissionProjectRead,
		PermissionProjectCreate,
		PermissionProjectEdit,
		PermissionProjectDelete,
		PermissionRoleRead,
		PermissionRoleManage:
		return true

	default:
		return false
	}
}

func AllPermissions() []Permission {
	return []Permission{
		PermissionTenantRead,
		PermissionTenantManage,
		PermissionUserRead,
		PermissionUserManage,
		PermissionProjectRead,
		PermissionProjectCreate,
		PermissionProjectEdit,
		PermissionProjectDelete,
		PermissionRoleRead,
		PermissionRoleManage,
	}
}

func DefaultUserPermissions() []Permission {
	return []Permission{
		PermissionTenantRead,
		PermissionUserRead,
		PermissionProjectRead,
	}
}

func ValidPermissions(permissions []Permission) bool {
	seen := make(map[Permission]struct{}, len(permissions))
	for _, permission := range permissions {
		if !permission.IsValid() {
			return false
		}
		if _, duplicate := seen[permission]; duplicate {
			return false
		}
		seen[permission] = struct{}{}
	}
	return true
}
