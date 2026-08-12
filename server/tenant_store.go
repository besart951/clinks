package clinks

import (
	"context"
)

type TenantProvisioner interface {
	CreateTenantOwner(
		ctx context.Context,
		registration TenantOwnerRegistration,
	) (Session, error)
}

type TenantAdministrationStore interface {
	Create(
		ctx context.Context,
		name string,
		createdBy UserID,
	) (Tenant, error)

	ListTenants(
		ctx context.Context,
		filter TenantFilter,
	) (Page[Tenant], error)

	UpdateSystem(
		ctx context.Context,
		tenant Tenant,
		actorID UserID,
	) (Tenant, error)
}

type TenantEditor interface {
	UpdateTenant(
		ctx context.Context,
		tenant Tenant,
		actorID UserID,
	) (Tenant, error)
}
