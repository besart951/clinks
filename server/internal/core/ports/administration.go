package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

// UserDirectory provides global User queries to Super Administration.
type UserDirectory interface {
	ListUsers(
		ctx context.Context,
		filter domain.UserFilter,
	) (domain.Page[domain.UserSummary], error)

	GetUser(
		ctx context.Context,
		id domain.UserID,
	) (domain.UserDetail, error)
}

// InvitationAdministration provides global and Tenant-scoped Invitation
// management at the persistence seam.
type InvitationAdministration interface {
	ListInvitations(
		ctx context.Context,
		filter domain.InvitationFilter,
	) (domain.Page[domain.Invitation], error)

	RevokeInvitation(
		ctx context.Context,
		id domain.InvitationID,
		actorID domain.UserID,
	) error

	ListTenantInvitations(
		ctx context.Context,
		tenantID domain.TenantID,
		filter domain.InvitationFilter,
	) (domain.Page[domain.Invitation], error)

	RevokeTenantInvitation(
		ctx context.Context,
		tenantID domain.TenantID,
		id domain.InvitationID,
		actorID domain.UserID,
	) error
}
