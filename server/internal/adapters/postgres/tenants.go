package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type TenantRepository struct {
	pool *pgxpool.Pool
}

func NewTenantRepository(pool *pgxpool.Pool) *TenantRepository {
	return &TenantRepository{pool: pool}
}

func (repository *TenantRepository) Create(ctx context.Context, name string, actor domain.UserID) (domain.Tenant, error) {
	var tenant domain.Tenant
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		id, err := newUUID()
		if err != nil {
			return err
		}
		tenant = domain.Tenant{ID: domain.TenantID(id), Name: strings.TrimSpace(name)}
		if _, err = tx.Exec(ctx, "INSERT INTO tenants (id, name) VALUES ($1, $2)", tenant.ID, tenant.Name); err != nil {
			return fmt.Errorf("create tenant: %w", err)
		}
		event := domain.AuditEvent{ActorID: &actor, TenantID: &tenant.ID, Action: "tenant.created", Target: tenant.Name}
		return insertAuditEvent(ctx, tx, &event)
	})
	return tenant, err
}

func (repository *TenantRepository) List(ctx context.Context) ([]domain.Tenant, error) {
	tenants := make([]domain.Tenant, 0)
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, "SELECT id, name FROM tenants ORDER BY created_at DESC")
		if err != nil {
			return fmt.Errorf("list tenants: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var tenant domain.Tenant
			if err = rows.Scan(&tenant.ID, &tenant.Name); err != nil {
				return fmt.Errorf("scan tenant: %w", err)
			}
			tenants = append(tenants, tenant)
		}
		return rows.Err()
	})
	return tenants, err
}
