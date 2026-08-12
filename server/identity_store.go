package clinks

import (
	"context"
)

type IdentityReader interface {
	FindByEmail(
		ctx context.Context,
		email Email,
	) (User, PasswordHash, error)

	FindByID(
		ctx context.Context,
		id UserID,
	) (User, error)
}

type SessionIdentityStore interface {
	IdentityReader

	InvalidateSession(
		ctx context.Context,
		userID UserID,
	) error

	RotateTenantSession(
		ctx context.Context,
		userID UserID,
		tenantID TenantID,
		tenantName string,
	) (int, error)
}

type ExternalIdentityStore interface {
	FindUser(
		ctx context.Context,
		issuer ExternalIssuer,
		subject ExternalSubject,
	) (User, error)

	LinkWithAudit(
		ctx context.Context,
		userID UserID,
		identity ExternalIdentity,
		tenantID *TenantID,
	) error
}
