package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

// AdminUserRepository provides user-management queries for platform
// administrators.
type AdminUserRepository interface {
	ListUsers(
		ctx context.Context,
		filter domain.UserFilter,
	) (domain.Page[domain.UserSummary], error)

	GetUser(
		ctx context.Context,
		id domain.UserID,
	) (domain.UserDetail, error)
}

// AdminInvitationRepository provides invitation-management operations
// for platform administrators.
type AdminInvitationRepository interface {
	ListInvitations(
		ctx context.Context,
		filter domain.InvitationFilter,
	) (domain.Page[domain.Invitation], error)

	RevokeInvitation(
		ctx context.Context,
		id domain.InvitationID,
	) error
}
