package postgres

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const defaultAuditDays = 30

type AuditRepository struct {
	pool *pgxpool.Pool
}

func NewAuditRepository(
	pool *pgxpool.Pool,
) *AuditRepository {
	return &AuditRepository{
		pool: pool,
	}
}

func (repository *AuditRepository) Append(
	ctx context.Context,
	event domain.AuditEvent,
) error {
	return withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			return insertAuditEvent(
				ctx,
				tx,
				event,
			)
		},
	)
}

func (repository *AuditRepository) List(
	ctx context.Context,
	filter domain.AuditFilter,
) (domain.AuditPage, error) {
	normalizeAuditFilter(&filter)

	query, arguments, err := auditQuery(filter)
	if err != nil {
		return domain.AuditPage{}, err
	}

	var events []domain.AuditEvent

	err = withSystemTx(
		ctx,
		repository.pool,
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
		return domain.AuditPage{}, err
	}

	page := domain.AuditPage{
		Events: events,
	}

	if len(page.Events) > filter.PageSize {
		page.Events =
			page.Events[:filter.PageSize]

		page.NextCursor = auditCursor(
			page.Events[len(page.Events)-1],
		)
	}

	return page, nil
}

func insertAuditEvent(
	ctx context.Context,
	tx pgx.Tx,
	event domain.AuditEvent,
) error {
	if event.ID == "" {
		id, err := newUUID()
		if err != nil {
			return err
		}

		event.ID = domain.AuditEventID(id)
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
	filter *domain.AuditFilter,
) {
	filter.PageSize =
		domain.EffectiveLimit(filter.PageSize)

	if filter.To.IsZero() {
		filter.To = time.Now().UTC()
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
	filter domain.AuditFilter,
) (string, pgx.StrictNamedArgs, error) {
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

	if filter.Cursor != "" {
		occurredAt, id, err :=
			parseAuditCursor(filter.Cursor)
		if err != nil {
			return "",
				nil,
				domain.NewError(
					domain.ErrorValidation,
				)
		}

		query += `
			AND (
				event.occurred_at,
				event.id
			) < (
				@cursor_occurred_at,
				@cursor_id
			)
		`

		arguments["cursor_occurred_at"] =
			occurredAt
		arguments["cursor_id"] = id
	}

	query += `
		ORDER BY
			event.occurred_at DESC,
			event.id DESC
		LIMIT @limit
	`

	return query, arguments, nil
}

func scanAuditEvent(
	row pgx.CollectableRow,
) (domain.AuditEvent, error) {
	var event domain.AuditEvent
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
		return domain.AuditEvent{}, err
	}

	if len(metadata) > 0 {
		if err := json.Unmarshal(
			metadata,
			&event.Metadata,
		); err != nil {
			return domain.AuditEvent{},
				fmt.Errorf(
					"decode audit metadata: %w",
					err,
				)
		}
	}

	return event, nil
}

func auditCursor(
	event domain.AuditEvent,
) domain.Cursor {
	value :=
		event.OccurredAt.UTC().
			Format(time.RFC3339Nano) +
			"|" +
			string(event.ID)

	return domain.Cursor(
		base64.RawURLEncoding.EncodeToString(
			[]byte(value),
		),
	)
}

func parseAuditCursor(
	cursor domain.Cursor,
) (time.Time, domain.AuditEventID, error) {
	decoded, err :=
		base64.RawURLEncoding.DecodeString(
			string(cursor),
		)
	if err != nil {
		return time.Time{}, "", err
	}

	occurredAtValue, idValue, found :=
		strings.Cut(
			string(decoded),
			"|",
		)
	if !found ||
		occurredAtValue == "" ||
		idValue == "" {
		return time.Time{},
			"",
			fmt.Errorf("invalid audit cursor")
	}

	occurredAt, err := time.Parse(
		time.RFC3339Nano,
		occurredAtValue,
	)
	if err != nil {
		return time.Time{}, "", err
	}

	return occurredAt,
		domain.AuditEventID(idValue),
		nil
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
