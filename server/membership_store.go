package clinks

import (
	"context"
)

type MembershipSessionReader interface {
	MembershipsForUser(
		ctx context.Context,
		userID UserID,
	) ([]Membership, error)

	FindActiveMembership(
		ctx context.Context,
		userID UserID,
		tenantID TenantID,
	) (Membership, error)
}

type MembershipManager interface {
	FindActiveMembership(
		ctx context.Context,
		userID UserID,
		tenantID TenantID,
	) (Membership, error)

	ListMemberships(
		ctx context.Context,
		tenantID TenantID,
		filter MembershipFilter,
	) (Page[Membership], error)

	UpdateMembership(
		ctx context.Context,
		membership Membership,
		actorID UserID,
	) (Membership, error)
}
