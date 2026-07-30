package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type TenantProvisioner interface {
	CreateTenantOwner(context.Context, domain.TenantOwnerRegistration) (domain.Session, error)
}

type TenantRepository interface {
	Create(context.Context, string, domain.UserID) (domain.Tenant, error)
	List(context.Context) ([]domain.Tenant, error)
}
