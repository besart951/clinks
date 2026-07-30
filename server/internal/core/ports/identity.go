package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type IdentityRepository interface {
	EnsureSuperAdmin(context.Context, domain.SuperAdminBootstrap) error
	FindByEmail(context.Context, domain.Email) (domain.User, domain.PasswordHash, error)
	FindByID(context.Context, domain.UserID) (domain.User, error)
	InvalidateSession(context.Context, domain.User) error
}

type ExternalIdentityRepository interface {
	FindExternalUser(context.Context, domain.ExternalIdentity) (domain.User, error)
	LinkExternalIdentity(context.Context, domain.UserID, domain.ExternalIdentity) error
}

type MembershipRepository interface {
	MembershipsForUser(context.Context, domain.UserID) ([]domain.Membership, error)
	FindActiveMembership(context.Context, domain.UserID, domain.TenantID) (domain.Membership, error)
	CreateInvitation(context.Context, *domain.Invitation) (domain.Invitation, error)
	FindInvitation(context.Context, domain.InvitationHash) (domain.Invitation, error)
	AcceptInvitation(context.Context, *domain.InvitationAcceptance) (domain.User, domain.Membership, error)
	AcceptExternalInvitation(context.Context, *domain.InvitationAcceptance, domain.ExternalIdentity) (domain.User, domain.Membership, error)
}

type PasswordHasher interface {
	Hash(string) (domain.PasswordHash, error)
	Verify(password string, hash domain.PasswordHash) bool
}

type SessionIssuer interface {
	Issue(*domain.SessionClaim) (string, error)
	Verify(string) (domain.SessionClaim, error)
}
