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

func NewTenantRepository(
	pool *pgxpool.Pool,
) *TenantRepository {
	return &TenantRepository{
		pool: pool,
	}
}

func (repository *TenantRepository) Create(
	ctx context.Context,
	name string,
	actorID domain.UserID,
) (domain.Tenant, error) {
	id, err := newUUID()
	if err != nil {
		return domain.Tenant{}, err
	}

	tenant := domain.Tenant{
		ID:   domain.TenantID(id),
		Name: strings.TrimSpace(name),
	}

	err = withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			if _, err := tx.Exec(
				ctx,
				`
					INSERT INTO tenants (
						id,
						name
					)
					VALUES ($1, $2)
				`,
				tenant.ID,
				tenant.Name,
			); err != nil {
				return fmt.Errorf(
					"create tenant: %w",
					err,
				)
			}

			return insertAuditEvent(
				ctx,
				tx,
				domain.AuditEvent{
					ActorID:  new(actorID),
					TenantID: new(tenant.ID),
					Action:   "tenant.created",
					Target:   tenant.Name,
				},
			)
		},
	)

	return tenant, err
}

func (repository *TenantRepository) List(
	ctx context.Context,
) ([]domain.Tenant, error) {
	var tenants []domain.Tenant

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			rows, err := tx.Query(
				ctx,
				`
					SELECT
						id,
						name
					FROM tenants
					ORDER BY created_at DESC, id DESC
				`,
			)
			if err != nil {
				return fmt.Errorf(
					"list tenants: %w",
					err,
				)
			}

			tenants, err = pgx.CollectRows(
				rows,
				func(
					row pgx.CollectableRow,
				) (domain.Tenant, error) {
					var tenant domain.Tenant

					err := row.Scan(
						&tenant.ID,
						&tenant.Name,
					)

					return tenant, err
				},
			)

			return err
		},
	)

	return tenants, err
}
