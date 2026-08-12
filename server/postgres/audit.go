package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	clinks "github.com/besartmorina/clinks/server"
)

const defaultAuditDays = 30

func (store *Store) Append(
	ctx context.Context,
	event clinks.AuditEvent,
) error {
	return withSystemTx(
		ctx,
		store.pool,
		func(tx pgx.Tx) error {
			return insertAuditEvent(
				ctx,
				tx,
				event,
			)
		},
	)
}

func (store *Store) ListAuditEvents(
	ctx context.Context,
	filter clinks.AuditFilter,
) (clinks.AuditPage, error) {
	normalizeAuditFilter(&filter)

	query, arguments, err := auditQuery(filter)
	if err != nil {
		return clinks.AuditPage{}, err
	}

	var events []clinks.AuditEvent

	err = withSystemTx(
		ctx,
		store.pool,
		func(tx pgx.Tx) error {
			rows, err := tx.Query(
				ctx,
				query,
				arguments,
			)
			if err != nil {
				return fmt.Errorf(
					"list audit events: %w",
					err,
				)
			}

			events, err = pgx.CollectRows(
				rows,
				scanAuditEvent,
			)

			return err
		},
	)
	if err != nil {
		return clinks.AuditPage{}, err
	}

	page := clinks.AuditPage{
		Events: events,
	}

	if len(page.Events) > filter.PageSize {
		page.Events = page.Events[:filter.PageSize]

		page.NextCursor = auditCursor(filter, page.Events[len(page.Events)-1])
	}

	return page, nil
}

func insertAuditEvent(
	ctx context.Context,
	tx pgx.Tx,
	event clinks.AuditEvent,
) error {
	if event.ID == "" {
		id, err := newUUID()
		if err != nil {
			return err
		}

		event.ID = clinks.AuditEventID(id)
	}

	metadata, err := json.Marshal(
		sanitizeMetadata(event.Metadata),
	)
	if err != nil {
		return fmt.Errorf(
			"marshal audit metadata: %w",
			err,
		)
	}

	_, err = tx.Exec(
		ctx,
		`
			INSERT INTO audit_events (
				id,
				occurred_at,
				actor_id,
				tenant_id,
				action,
				target,
				metadata
			)
			VALUES (
				$1,
				COALESCE($2, now()),
				$3,
				$4,
				$5,
				$6,
				$7
			)
		`,
		event.ID,
		nullableTime(event.OccurredAt),
		event.ActorID,
		event.TenantID,
		event.Action,
		event.Target,
		metadata,
	)
	if err != nil {
		return fmt.Errorf(
			"append audit event: %w",
			err,
		)
	}

	return nil
}

func normalizeAuditFilter(
	filter *clinks.AuditFilter,
) {
	filter.PageSize = clinks.EffectiveLimit(filter.PageSize)
	if !filter.Direction.IsValid() {
		filter.Direction = clinks.SortDescending
	}

	if filter.To.IsZero() {
		now := time.Now().UTC()
		filter.To = time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	}

	if filter.From.IsZero() {
		filter.From = filter.To.AddDate(
			0,
			0,
			-defaultAuditDays,
		)
	}
}

func auditQuery(
	filter clinks.AuditFilter,
) (string, pgx.StrictNamedArgs, error) {
	fingerprint := auditFilterFingerprint(filter)
	query := `
		SELECT
			event.id,
			event.occurred_at,
			event.actor_id,
			COALESCE(actor.email, ''),
			event.tenant_id,
			COALESCE(tenant.name, ''),
			event.action,
			event.target,
			event.metadata
		FROM audit_events event
		LEFT JOIN users actor
			ON actor.id = event.actor_id
		LEFT JOIN tenants tenant
			ON tenant.id = event.tenant_id
		WHERE
			event.occurred_at >= @from
			AND event.occurred_at <= @to
	`

	arguments := pgx.StrictNamedArgs{
		"from":  filter.From,
		"to":    filter.To,
		"limit": filter.PageSize + 1,
	}

	if filter.ActorID != nil {
		query += `
			AND event.actor_id = @actor_id
		`
		arguments["actor_id"] = *filter.ActorID
	}

	if filter.TenantID != nil {
		query += `
			AND event.tenant_id = @tenant_id
		`
		arguments["tenant_id"] = *filter.TenantID
	}

	if filter.Action != "" {
		query += `
			AND event.action = @action
		`
		arguments["action"] = filter.Action
	}

	search := strings.TrimSpace(filter.Search)
	if search != "" {
		query += `
			AND (
				COALESCE(actor.email, '')
					ILIKE '%' || @search || '%'
				OR COALESCE(tenant.name, '')
					ILIKE '%' || @search || '%'
				OR event.action
					ILIKE '%' || @search || '%'
				OR event.target
					ILIKE '%' || @search || '%'
			)
		`

		arguments["search"] = search
	}

	operator, order := keysetDirection(filter.Direction)
	if filter.Cursor != "" {
		cursor, err := decodeUUIDKeysetCursor(filter.Cursor, "audit", fingerprint)
		if err != nil {
			return "",
				nil,
				clinks.NewError(
					clinks.ErrorValidation,
				)
		}
		occurredAt, err := time.Parse(time.RFC3339Nano, cursor.SortValue)
		if err != nil {
			return "", nil, clinks.NewError(clinks.ErrorValidation)
		}

		query += fmt.Sprintf(" AND (event.occurred_at, event.id) %s (@cursor_occurred_at, @cursor_id)", operator)

		arguments["cursor_occurred_at"] = occurredAt
		arguments["cursor_id"] = cursor.ID
	}

	query += fmt.Sprintf(" ORDER BY event.occurred_at %s, event.id %s LIMIT @limit", order, order)

	return query, arguments, nil
}

func scanAuditEvent(
	row pgx.CollectableRow,
) (clinks.AuditEvent, error) {
	var event clinks.AuditEvent
	var metadata []byte

	err := row.Scan(
		&event.ID,
		&event.OccurredAt,
		&event.ActorID,
		&event.ActorEmail,
		&event.TenantID,
		&event.TenantName,
		&event.Action,
		&event.Target,
		&metadata,
	)
	if err != nil {
		return clinks.AuditEvent{}, err
	}

	if len(metadata) > 0 {
		if err := json.Unmarshal(
			metadata,
			&event.Metadata,
		); err != nil {
			return clinks.AuditEvent{},
				fmt.Errorf(
					"decode audit metadata: %w",
					err,
				)
		}
	}

	return event, nil
}

func auditCursor(filter clinks.AuditFilter, event clinks.AuditEvent) clinks.Cursor {
	return encodeKeysetCursor(
		"audit",
		auditFilterFingerprint(filter),
		event.OccurredAt.UTC().Format(time.RFC3339Nano),
		string(event.ID),
	)
}

func auditFilterFingerprint(filter clinks.AuditFilter) string {
	return keysetFingerprint(
		filter.From.UTC().Format(time.RFC3339Nano),
		filter.To.UTC().Format(time.RFC3339Nano),
		optionalString(filter.ActorID),
		optionalString(filter.TenantID),
		filter.Action,
		strings.ToLower(strings.TrimSpace(filter.Search)),
		filter.Direction,
	)
}

func nullableTime(
	value time.Time,
) any {
	if value.IsZero() {
		return nil
	}

	return value
}

func sanitizeMetadata(
	metadata map[string]string,
) map[string]string {
	if len(metadata) == 0 {
		return nil
	}

	clean := make(
		map[string]string,
		len(metadata),
	)

	for key, value := range metadata {
		lower := strings.ToLower(key)

		if strings.Contains(lower, "password") ||
			strings.Contains(lower, "token") ||
			strings.Contains(lower, "hash") ||
			strings.Contains(lower, "secret") {
			continue
		}

		clean[key] = value
	}

	return clean
}
