package mocks

import (
	"context"
	"fmt"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

var _ ports.TenantRepository = (*MemoryTenantRepo)(nil)

type MemoryTenantRepo struct {
	tenants map[domain.TenantID]domain.Tenant
}

func NewMemoryTenantRepo() *MemoryTenantRepo {
	return &MemoryTenantRepo{
		tenants: make(map[domain.TenantID]domain.Tenant),
	}
}

func (repo *MemoryTenantRepo) Create(ctx context.Context, name string, ownerID domain.UserID) (domain.Tenant, error) {
	id := domain.TenantID(fmt.Sprintf("tenant-%d", len(repo.tenants)+1))
	tenant := domain.Tenant{
		ID:   id,
		Name: name,
	}
	repo.tenants[id] = tenant
	return tenant, nil
}

func (repo *MemoryTenantRepo) List(ctx context.Context) ([]domain.Tenant, error) {
	result := make([]domain.Tenant, 0, len(repo.tenants))
	for _, tenant := range repo.tenants {
		result = append(result, tenant)
	}
	return result, nil
}
