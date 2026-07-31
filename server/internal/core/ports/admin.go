package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

// AdminUserRepository provides super-admin user management queries.
type AdminUserRepository interface {
	ListUsers(context.Context, domain.UserFilter) (domain.Page[domain.UserSummary], error)
	GetUser(ctx context.Context, id domain.UserID) (domain.UserDetail, error)
}

// AdminInvitationRepository provides super-admin invitation management queries.
type AdminInvitationRepository interface {
	ListInvitations(context.Context, domain.InvitationFilter) (domain.Page[domain.Invitation], error)
	RevokeInvitation(ctx context.Context, id domain.InvitationID) error
}

// SystemStatsRepository provides aggregate counts for the admin overview.
type SystemStatsRepository interface {
	Stats(context.Context) (domain.SystemStats, error)
}
