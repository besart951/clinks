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

// UserSummary is a lightweight projection for admin user listings.
type UserSummary struct {
	ID              UserID
	Email           Email
	Locale          Locale
	IsSuperAdmin    bool
	MembershipCount int
}

// UserDetail is a full user view including all active memberships.
type UserDetail struct {
	User        User
	Memberships []Membership
}

// UserFilter carries optional search, filter, and pagination for user lists.
type UserFilter struct {
	Search string
	Role   *Role
	Cursor Cursor
	Limit  int
}

// InvitationFilter carries optional filter and pagination for invitation lists.
type InvitationFilter struct {
	Search   string
	TenantID *TenantID
	Status   string // "pending", "used", "expired", "" means all
	Cursor   Cursor
	Limit    int
}

// SystemStats holds aggregate counts for the admin dashboard overview.
type SystemStats struct {
	UserCount              int
	TenantCount            int
	PendingInvitationCount int
	ActiveLanguageCount    int
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
