package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type IdentityRepository interface {
	EnsureSuperAdmin(
		ctx context.Context,
		bootstrap domain.SuperAdminBootstrap,
	) error

	FindByEmail(
		ctx context.Context,
		email domain.Email,
	) (domain.User, domain.PasswordHash, error)

	FindByID(
		ctx context.Context,
		id domain.UserID,
	) (domain.User, error)

	InvalidateSession(
		ctx context.Context,
		userID domain.UserID,
	) error
}

type ExternalIdentityRepository interface {
	FindUser(
		ctx context.Context,
		issuer domain.ExternalIssuer,
		subject domain.ExternalSubject,
	) (domain.User, error)

	Link(
		ctx context.Context,
		userID domain.UserID,
		identity domain.ExternalIdentity,
	) error
}
