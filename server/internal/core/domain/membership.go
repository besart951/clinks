package domain

type (
	MembershipID     string
	RoleID           string
	MembershipStatus string
)

const (
	MembershipActive MembershipStatus = "ACTIVE"
)

type Membership struct {
	ID       MembershipID
	UserID   UserID
	Tenant   Tenant
	RoleID   RoleID
	RoleName string
	Status   MembershipStatus
}

func (role Role) IsValid() bool {
	switch role {
	case RoleSuperAdmin,
		RoleTenantAdmin,
		RoleUser:
		return true

	default:
		return false
	}
}

func (role Role) IsSuperAdmin() bool {
	return role == RoleSuperAdmin
}

func (role Role) IsTenantRole() bool {
	switch role {
	case RoleTenantAdmin,
		RoleUser:
		return true

	default:
		return false
	}
}

func (status MembershipStatus) IsValid() bool {
	return status == MembershipActive
}

func (membership Membership) CanAdminister() bool {
	return membership.Status == MembershipActive &&
		membership.Role == RoleTenantAdmin
}
