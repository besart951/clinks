package domain

type (
	PasswordHash    string
	ExternalIssuer  string
	ExternalSubject string
)

type Session struct {
	Token        string
	User         User
	ActiveTenant *Tenant
	Memberships  []Membership
}

type SessionClaim struct {
	UserID         UserID
	ActiveTenantID *TenantID
	SessionVersion int
}

type ExternalIdentity struct {
	Issuer  ExternalIssuer
	Subject ExternalSubject
	Email   Email
	UserID  UserID
}
