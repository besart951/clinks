package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type TenantProvisioner interface {
	CreateTenantOwner(
		ctx context.Context,
		registration domain.TenantOwnerRegistration,
	) (domain.Session, error)
}

type TenantAdministrationRepository interface {
	Create(
		ctx context.Context,
		name string,
		createdBy domain.UserID,
	) (domain.Tenant, error)

	ListTenants(
		ctx context.Context,
		filter domain.TenantFilter,
	) (domain.Page[domain.Tenant], error)

	UpdateSystem(
		ctx context.Context,
		tenant domain.Tenant,
		actorID domain.UserID,
	) (domain.Tenant, error)
}

type TenantEditor interface {
	UpdateTenant(
		ctx context.Context,
		tenant domain.Tenant,
		actorID domain.UserID,
	) (domain.Tenant, error)
}
