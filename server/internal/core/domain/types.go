// Package domain contains dependency-free business entities and value types.
package domain

import (
	"net/mail"
	"strings"
	"time"
)

type (
	TenantID         string
	UserID           string
	MembershipID     string
	InvitationID     string
	AuditEventID     string
	Locale           string
	Email            string
	Role             string
	MembershipStatus string
	ApplicationScope string
	PasswordHash     string
	InvitationToken  string
	InvitationHash   string
)

const (
	RoleSuperAdmin  Role = "ROLE_SUPER_ADMIN"
	RoleTenantAdmin Role = "ROLE_TENANT_ADMIN"
	RoleUser        Role = "ROLE_USER"

	MembershipActive MembershipStatus = "ACTIVE"

	ScopeShared     ApplicationScope = "shared"
	ScopeAdmin      ApplicationScope = "admin"
	ScopePlanerLink ApplicationScope = "planer_link"
	ScopeInfraLink  ApplicationScope = "infra_link"
)

type Tenant struct {
	ID   TenantID
	Name string
}

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

type TenantOwnerRegistration struct {
	Email        Email
	PasswordHash PasswordHash
	Locale       Locale
	TenantName   string
}

type SuperAdminBootstrap struct {
	Email        Email
	PasswordHash PasswordHash
	Locale       Locale
}

type Invitation struct {
	ID             InvitationID
	TenantID       TenantID
	Email          Email
	Role           Role
	TokenHash      InvitationHash
	ExpiresAt      time.Time
	UsedAt         *time.Time
	CreatedBy      UserID
	Acceptance     string
	DeliveryStatus string
}

type InvitationAcceptance struct {
	Invitation Invitation
	User       User
	Password   *PasswordHash
}

type Language struct {
	Code      Locale
	Name      string
	IsDefault bool
	IsActive  bool
}

type Translation struct {
	Locale           Locale
	ApplicationScope ApplicationScope
	Key              string
	Value            string
}

type TranslationBundle struct {
	Locale       Locale
	Translations []Translation
}

type AuditEvent struct {
	ID         AuditEventID
	OccurredAt time.Time
	ActorID    *UserID
	ActorEmail string
	TenantID   *TenantID
	TenantName string
	Action     string
	Target     string
	Metadata   map[string]string
}

type AuditFilter struct {
	From     time.Time
	To       time.Time
	ActorID  *UserID
	TenantID *TenantID
	Action   string
	Cursor   string
	PageSize int
}

type AuditPage struct {
	Events     []AuditEvent
	NextCursor string
}

func ParseEmail(value string) (Email, error) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	parsed, err := mail.ParseAddress(normalized)
	if err != nil || parsed.Address != normalized {
		return "", NewError(ErrorValidation)
	}
	return Email(normalized), nil
}

func (email Email) Validate() error {
	_, err := ParseEmail(string(email))
	return err
}

func (tenantID TenantID) IsValid() bool {
	return strings.TrimSpace(string(tenantID)) != ""
}

func (tenantID TenantID) Validate() error {
	if !tenantID.IsValid() {
		return NewError(ErrorValidation)
	}
	return nil
}

func NewLocale(value string) Locale {
	return Locale(strings.TrimSpace(value))
}

func ParseApplicationScope(value string) (ApplicationScope, error) {
	scope := ApplicationScope(strings.TrimSpace(value))
	if scope == "" {
		return ScopeShared, nil
	}
	if !scope.IsValid() {
		return "", NewError(ErrorValidation)
	}
	return scope, nil
}

func (locale Locale) IsValid() bool {
	parts := strings.Split(string(locale), "-")
	if len(parts) < 1 || len(parts) > 2 || !letters(parts[0], 'a', 'z', 2, 3) {
		return false
	}
	return len(parts) == 1 || letters(parts[1], 'A', 'Z', 2, 2)
}

func (scope ApplicationScope) IsValid() bool {
	return scope == ScopeShared || scope == ScopeAdmin || scope == ScopePlanerLink || scope == ScopeInfraLink
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

func letters(value string, minimum, maximum rune, minimumLength, maximumLength int) bool {
	if len(value) < minimumLength || len(value) > maximumLength {
		return false
	}
	for _, character := range value {
		if character < minimum || character > maximum {
			return false
		}
	}
	return true
}
