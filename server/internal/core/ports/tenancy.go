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

type TenantRepository interface {
	Create(
		ctx context.Context,
		name string,
		createdBy domain.UserID,
	) (domain.Tenant, error)

	List(
		ctx context.Context,
	) ([]domain.Tenant, error)
}
