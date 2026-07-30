package ports

import (
	"context"
	"time"

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

type TenantProvisioner interface {
	CreateTenantOwner(context.Context, domain.TenantOwnerRegistration) (domain.Session, error)
}

type TenantRepository interface {
	Create(context.Context, string, domain.UserID) (domain.Tenant, error)
	List(context.Context) ([]domain.Tenant, error)
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

type AuditLog interface {
	Append(context.Context, *domain.AuditEvent) error
	List(context.Context, *domain.AuditFilter) (domain.AuditPage, error)
}

type InvitationMailer interface {
	Send(context.Context, *domain.Invitation) (string, error)
}

type InvitationTokenSigner interface {
	NewInvitationID() (domain.InvitationID, error)
	Token(domain.Invitation) (string, error)
}

type OutboxRepository interface {
	ClaimInvitationEmail(context.Context) (domain.OutboxJob, domain.Invitation, error)
	Complete(context.Context, domain.OutboxJobID) error
	Retry(context.Context, domain.OutboxJobID, int, error) error
	AnonymizeExpiredInvitations(context.Context, time.Time) (int, error)
}
