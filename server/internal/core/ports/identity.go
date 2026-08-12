package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type BootstrapRepository interface {
	EnsureSuperAdmin(
		ctx context.Context,
		bootstrap domain.SuperAdminBootstrap,
	) error
}

type IdentityReader interface {
	FindByEmail(
		ctx context.Context,
		email domain.Email,
	) (domain.User, domain.PasswordHash, error)

	FindByID(
		ctx context.Context,
		id domain.UserID,
	) (domain.User, error)
}

type SessionIdentityRepository interface {
	IdentityReader

	InvalidateSession(
		ctx context.Context,
		userID domain.UserID,
	) error

	RotateTenantSession(
		ctx context.Context,
		userID domain.UserID,
		tenantID domain.TenantID,
		tenantName string,
	) (int, error)
}

type ExternalIdentityRepository interface {
	FindUser(
		ctx context.Context,
		issuer domain.ExternalIssuer,
		subject domain.ExternalSubject,
	) (domain.User, error)

	LinkWithAudit(
		ctx context.Context,
		userID domain.UserID,
		identity domain.ExternalIdentity,
		tenantID *domain.TenantID,
	) error
}
