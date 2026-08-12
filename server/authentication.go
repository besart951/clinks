package clinks

import (
	"strings"
	"unicode/utf8"
)

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

func (identity ExternalIdentity) Validate() error {
	issuer := strings.TrimSpace(string(identity.Issuer))
	subject := strings.TrimSpace(string(identity.Subject))
	if issuer == "" || subject == "" ||
		!utf8.ValidString(issuer) || !utf8.ValidString(subject) ||
		identity.Email.Validate() != nil {
		return NewError(ErrorValidation)
	}
	return nil
}
