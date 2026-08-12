package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	clinks "github.com/besartmorina/clinks/server"
)

func (store *Store) Create(
	ctx context.Context,
	name string,
	actorID clinks.UserID,
) (clinks.Tenant, error) {
	id, err := newUUID()
	if err != nil {
		return clinks.Tenant{}, err
	}

	tenant := clinks.Tenant{
		ID:       clinks.TenantID(id),
		Name:     strings.TrimSpace(name),
		Revision: 1,
	}

	err = withSystemTx(
		ctx,
		store.pool,
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
				clinks.AuditEvent{
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

func (store *Store) ListTenants(
	ctx context.Context,
	filter clinks.TenantFilter,
) (clinks.Page[clinks.Tenant], error) {
	pageSize := clinks.EffectiveLimit(filter.Limit)
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
	if filter.Sort == clinks.TenantSortCreatedAt {
		sortExpression = "created_at"
	}
	operator, order := keysetDirection(filter.Direction)
	if filter.Cursor != "" {
		cursor, err := decodeUUIDKeysetCursor(filter.Cursor, "tenants", fingerprint)
		if err != nil {
			return clinks.Page[clinks.Tenant]{}, clinks.NewError(clinks.ErrorValidation)
		}
		arguments["cursor_id"] = cursor.ID
		if filter.Sort == clinks.TenantSortCreatedAt {
			value, err := time.Parse(time.RFC3339Nano, cursor.SortValue)
			if err != nil {
				return clinks.Page[clinks.Tenant]{}, clinks.NewError(clinks.ErrorValidation)
			}
			arguments["cursor_sort"] = value
		} else {
			arguments["cursor_sort"] = cursor.SortValue
		}
		query += fmt.Sprintf(" AND (%s, id) %s (@cursor_sort, @cursor_id)", sortExpression, operator)
	}
	query += fmt.Sprintf(" ORDER BY %s %s, id %s LIMIT @limit", sortExpression, order, order)

	var page clinks.Page[clinks.Tenant]

	err := withSystemTx(
		ctx,
		store.pool,
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
				) (clinks.Tenant, error) {
					var tenant clinks.Tenant

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
		return clinks.Page[clinks.Tenant]{}, err
	}
	if len(page.Items) > pageSize {
		page.Items = page.Items[:pageSize]
		last := page.Items[len(page.Items)-1]
		sortValue := last.Name
		if filter.Sort == clinks.TenantSortCreatedAt {
			sortValue = last.CreatedAt.UTC().Format(time.RFC3339Nano)
		}
		page.NextCursor = encodeKeysetCursor("tenants", fingerprint, sortValue, string(last.ID))
	}
	return page, nil
}

func (store *Store) UpdateSystem(
	ctx context.Context,
	tenant clinks.Tenant,
	actorID clinks.UserID,
) (clinks.Tenant, error) {
	err := withSystemTx(ctx, store.pool, func(tx pgx.Tx) error {
		return updateTenantTx(ctx, tx, &tenant, actorID)
	})
	return tenant, err
}

func (store *Store) UpdateTenant(
	ctx context.Context,
	tenant clinks.Tenant,
	actorID clinks.UserID,
) (clinks.Tenant, error) {
	err := WithTenantTx(ctx, store.pool, tenant.ID, func(tx pgx.Tx) error {
		return updateTenantTx(ctx, tx, &tenant, actorID)
	})
	return tenant, err
}

func updateTenantTx(
	ctx context.Context,
	tx pgx.Tx,
	tenant *clinks.Tenant,
	actorID clinks.UserID,
) error {
	err := tx.QueryRow(ctx, `
		UPDATE tenants
		SET name = $2, revision = revision + 1, updated_at = now()
		WHERE id = $1 AND revision = $3
		RETURNING revision
	`, tenant.ID, tenant.Name, tenant.Revision).Scan(&tenant.Revision)
	if err == pgx.ErrNoRows {
		return clinks.NewError(clinks.ErrorConflict)
	}
	if err != nil {
		return fmt.Errorf("update tenant: %w", err)
	}
	return insertAuditEvent(ctx, tx, clinks.AuditEvent{
		ActorID: new(actorID), TenantID: new(tenant.ID),
		Action: "tenant.updated", Target: tenant.Name,
	})
}
