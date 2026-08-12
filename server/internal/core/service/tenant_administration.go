package service

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type TenantAdministration struct {
	tenants ports.TenantAdministrationRepository
}

func NewTenantAdministration(tenants ports.TenantAdministrationRepository) *TenantAdministration {
	return &TenantAdministration{tenants: tenants}
}

func (administration *TenantAdministration) CreateTenant(ctx context.Context, name string, actorID domain.UserID) (domain.Tenant, error) {
	name, err := domain.NormalizeTenantName(name)
	if err != nil || !actorID.IsValid() {
		return domain.Tenant{}, domain.NewError(domain.ErrorValidation)
	}
	return administration.tenants.Create(ctx, name, actorID)
}

func (administration *TenantAdministration) Tenants(ctx context.Context, filter domain.TenantFilter) (domain.Page[domain.Tenant], error) {
	filter, err := filter.Normalized()
	if err != nil {
		return domain.Page[domain.Tenant]{}, err
	}
	return administration.tenants.ListTenants(ctx, filter)
}

func (administration *TenantAdministration) UpdateTenant(ctx context.Context, tenant domain.Tenant, actorID domain.UserID) (domain.Tenant, error) {
	name, err := domain.NormalizeTenantName(tenant.Name)
	if err != nil || !tenant.ID.IsValid() || tenant.Revision == 0 || !actorID.IsValid() {
		return domain.Tenant{}, domain.NewError(domain.ErrorValidation)
	}
	tenant.Name = name
	return administration.tenants.UpdateSystem(ctx, tenant, actorID)
}
