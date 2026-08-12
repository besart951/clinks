package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type MembershipSessionReader interface {
	MembershipsForUser(
		ctx context.Context,
		userID domain.UserID,
	) ([]domain.Membership, error)

	FindActiveMembership(
		ctx context.Context,
		userID domain.UserID,
		tenantID domain.TenantID,
	) (domain.Membership, error)
}

type MembershipManager interface {
	FindActiveMembership(
		ctx context.Context,
		userID domain.UserID,
		tenantID domain.TenantID,
	) (domain.Membership, error)

	ListMemberships(
		ctx context.Context,
		tenantID domain.TenantID,
		filter domain.MembershipFilter,
	) (domain.Page[domain.Membership], error)

	UpdateMembership(
		ctx context.Context,
		membership domain.Membership,
		actorID domain.UserID,
	) (domain.Membership, error)
}
