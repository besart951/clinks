package clinks

import (
	"context"
)

// UserStore provides global user queries.
type UserStore interface {
	ListUsers(
		ctx context.Context,
		filter UserFilter,
	) (Page[UserSummary], error)

	GetUser(
		ctx context.Context,
		id UserID,
	) (UserDetail, error)
}

// InvitationAdminStore provides global and tenant-scoped invitation access.
type InvitationAdminStore interface {
	ListInvitations(
		ctx context.Context,
		filter InvitationFilter,
	) (Page[Invitation], error)

	RevokeInvitation(
		ctx context.Context,
		id InvitationID,
		actorID UserID,
	) error

	ListTenantInvitations(
		ctx context.Context,
		tenantID TenantID,
		filter InvitationFilter,
	) (Page[Invitation], error)

	RevokeTenantInvitation(
		ctx context.Context,
		tenantID TenantID,
		id InvitationID,
		actorID UserID,
	) error
}
