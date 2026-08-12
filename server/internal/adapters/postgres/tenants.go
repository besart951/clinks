package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func (repository *Store) Create(
	ctx context.Context,
	name string,
	actorID domain.UserID,
) (domain.Tenant, error) {
	id, err := newUUID()
	if err != nil {
		return domain.Tenant{}, err
	}

	tenant := domain.Tenant{
		ID:       domain.TenantID(id),
		Name:     strings.TrimSpace(name),
		Revision: 1,
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

			if _, err := createDefaultRoles(ctx, tx, tenant.ID); err != nil {
				return err
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

func (repository *Store) ListTenants(
	ctx context.Context,
	filter domain.TenantFilter,
) (domain.Page[domain.Tenant], error) {
	pageSize := domain.EffectiveLimit(filter.Limit)
	search := strings.TrimSpace(filter.Search)
	fingerprint := keysetFingerprint(strings.ToLower(search), filter.Sort, filter.Direction)
	query := `
		SELECT id, name, revision, created_at, updated_at
		FROM tenants
		WHERE TRUE
	`
	arguments := pgx.StrictNamedArgs{"limit": pageSize + 1}
	if search != "" {
		query += ` AND name ILIKE '%' || @search || '%'`
		arguments["search"] = search
	}
	sortExpression := "name"
	if filter.Sort == domain.TenantSortCreatedAt {
		sortExpression = "created_at"
	}
	operator, order := keysetDirection(filter.Direction)
	if filter.Cursor != "" {
		cursor, err := decodeUUIDKeysetCursor(filter.Cursor, "tenants", fingerprint)
		if err != nil {
			return domain.Page[domain.Tenant]{}, domain.NewError(domain.ErrorValidation)
		}
		arguments["cursor_id"] = cursor.ID
		if filter.Sort == domain.TenantSortCreatedAt {
			value, err := time.Parse(time.RFC3339Nano, cursor.SortValue)
			if err != nil {
				return domain.Page[domain.Tenant]{}, domain.NewError(domain.ErrorValidation)
			}
			arguments["cursor_sort"] = value
		} else {
			arguments["cursor_sort"] = cursor.SortValue
		}
		query += fmt.Sprintf(" AND (%s, id) %s (@cursor_sort, @cursor_id)", sortExpression, operator)
	}
	query += fmt.Sprintf(" ORDER BY %s %s, id %s LIMIT @limit", sortExpression, order, order)

	var page domain.Page[domain.Tenant]

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			rows, err := tx.Query(ctx, query, arguments)
			if err != nil {
				return fmt.Errorf(
					"list tenants: %w",
					err,
				)
			}

			page.Items, err = pgx.CollectRows(
				rows,
				func(
					row pgx.CollectableRow,
				) (domain.Tenant, error) {
					var tenant domain.Tenant

					err := row.Scan(
						&tenant.ID,
						&tenant.Name,
						&tenant.Revision,
						&tenant.CreatedAt,
						&tenant.UpdatedAt,
					)

					return tenant, err
				},
			)

			return err
		},
	)
	if err != nil {
		return domain.Page[domain.Tenant]{}, err
	}
	if len(page.Items) > pageSize {
		page.Items = page.Items[:pageSize]
		last := page.Items[len(page.Items)-1]
		sortValue := last.Name
		if filter.Sort == domain.TenantSortCreatedAt {
			sortValue = last.CreatedAt.UTC().Format(time.RFC3339Nano)
		}
		page.NextCursor = encodeKeysetCursor("tenants", fingerprint, sortValue, string(last.ID))
	}
	return page, nil
}

func (repository *Store) UpdateSystem(
	ctx context.Context,
	tenant domain.Tenant,
	actorID domain.UserID,
) (domain.Tenant, error) {
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		return updateTenantTx(ctx, tx, &tenant, actorID)
	})
	return tenant, err
}

func (repository *Store) UpdateTenant(
	ctx context.Context,
	tenant domain.Tenant,
	actorID domain.UserID,
) (domain.Tenant, error) {
	err := WithTenantTx(ctx, repository.pool, tenant.ID, func(tx pgx.Tx) error {
		return updateTenantTx(ctx, tx, &tenant, actorID)
	})
	return tenant, err
}

func updateTenantTx(
	ctx context.Context,
	tx pgx.Tx,
	tenant *domain.Tenant,
	actorID domain.UserID,
) error {
	err := tx.QueryRow(ctx, `
		UPDATE tenants
		SET name = $2, revision = revision + 1, updated_at = now()
		WHERE id = $1 AND revision = $3
		RETURNING revision
	`, tenant.ID, tenant.Name, tenant.Revision).Scan(&tenant.Revision)
	if err == pgx.ErrNoRows {
		return domain.NewError(domain.ErrorConflict)
	}
	if err != nil {
		return fmt.Errorf("update tenant: %w", err)
	}
	return insertAuditEvent(ctx, tx, domain.AuditEvent{
		ActorID: new(actorID), TenantID: new(tenant.ID),
		Action: "tenant.updated", Target: tenant.Name,
	})
}
