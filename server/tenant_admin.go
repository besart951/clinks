package clinks

import (
	"context"
)

type TenantAdmin struct {
	tenants TenantAdministrationStore
}

func NewTenantAdmin(tenants TenantAdministrationStore) *TenantAdmin {
	return &TenantAdmin{tenants: tenants}
}

func (administration *TenantAdmin) CreateTenant(ctx context.Context, name string, actorID UserID) (Tenant, error) {
	name, err := NormalizeTenantName(name)
	if err != nil || !actorID.IsValid() {
		return Tenant{}, NewError(ErrorValidation)
	}
	return administration.tenants.Create(ctx, name, actorID)
}

func (administration *TenantAdmin) Tenants(ctx context.Context, filter TenantFilter) (Page[Tenant], error) {
	filter, err := filter.Normalized()
	if err != nil {
		return Page[Tenant]{}, err
	}
	return administration.tenants.ListTenants(ctx, filter)
}

func (administration *TenantAdmin) UpdateTenant(ctx context.Context, tenant Tenant, actorID UserID) (Tenant, error) {
	name, err := NormalizeTenantName(tenant.Name)
	if err != nil || !tenant.ID.IsValid() || tenant.Revision == 0 || !actorID.IsValid() {
		return Tenant{}, NewError(ErrorValidation)
	}
	tenant.Name = name
	return administration.tenants.UpdateSystem(ctx, tenant, actorID)
}
