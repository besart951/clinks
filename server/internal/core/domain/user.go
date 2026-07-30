package domain

type (
	UserID           string
	MembershipID     string
	Role             string
	MembershipStatus string
	PasswordHash     string
	ExternalIssuer   string
	ExternalSubject  string
)

const (
	RoleSuperAdmin  Role = "ROLE_SUPER_ADMIN"
	RoleTenantAdmin Role = "ROLE_TENANT_ADMIN"
	RoleUser        Role = "ROLE_USER"

	MembershipActive MembershipStatus = "ACTIVE"
)

// User is a global identity. Tenant roles belong exclusively to Membership.
type User struct {
	ID             UserID
	Email          Email
	Role           Role
	Locale         Locale
	SessionVersion int
}

type Membership struct {
	ID     MembershipID
	UserID UserID
	Tenant Tenant
	Role   Role
	Status MembershipStatus
}

type Session struct {
	Token        string
	User         User
	ActiveTenant *Tenant
	Memberships  []Membership
}

type SessionClaim struct {
	User           User
	ActiveTenantID *TenantID
}

type ExternalIdentity struct {
	Issuer  ExternalIssuer
	Subject ExternalSubject
	Email   Email
	UserID  UserID
}

func NewUserID(id string) UserID {
	return UserID(id)
}

func (role Role) IsSuperAdmin() bool {
	return role == RoleSuperAdmin
}

func (role Role) IsTenantRole() bool {
	return role == RoleTenantAdmin || role == RoleUser
}

func (membership *Membership) CanAdminister() bool {
	return membership.Status == MembershipActive && membership.Role == RoleTenantAdmin
}
