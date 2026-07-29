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

type AuditRepository struct {
	pool *pgxpool.Pool
}

func NewAuditRepository(pool *pgxpool.Pool) *AuditRepository {
	return &AuditRepository{pool: pool}
}

func (repository *AuditRepository) Append(ctx context.Context, event *domain.AuditEvent) error {
	return withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		return insertAuditEvent(ctx, tx, event)
	})
}

func (repository *AuditRepository) List(ctx context.Context, filter *domain.AuditFilter) (domain.AuditPage, error) {
	normalizeAuditFilter(filter)
	query, arguments, err := auditQuery(filter)
	if err != nil {
		return domain.AuditPage{}, err
	}
	page := domain.AuditPage{Events: make([]domain.AuditEvent, 0, filter.PageSize)}
	err = withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		rows, queryErr := tx.Query(ctx, query, arguments...)
		if queryErr != nil {
			return fmt.Errorf("list audit events: %w", queryErr)
		}
		defer rows.Close()
		for rows.Next() {
			event, scanErr := scanAuditEvent(rows)
			if scanErr != nil {
				return scanErr
			}
			page.Events = append(page.Events, event)
		}
		return rows.Err()
	})
	if err != nil {
		return domain.AuditPage{}, err
	}
	if len(page.Events) > filter.PageSize {
		last := page.Events[filter.PageSize-1]
		page.NextCursor = auditCursor(&last)
		page.Events = page.Events[:filter.PageSize]
	}
	return page, nil
}

func insertAuditEvent(ctx context.Context, tx pgx.Tx, event *domain.AuditEvent) error {
	if event.ID == "" {
		id, err := newUUID()
		if err != nil {
			return err
		}
		event.ID = domain.AuditEventID(id)
	}
	metadata, err := json.Marshal(sanitizeMetadata(event.Metadata))
	if err != nil {
		return fmt.Errorf("marshal audit metadata: %w", err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events (id, occurred_at, actor_id, tenant_id, action, target, metadata)
		VALUES ($1, COALESCE($2, now()), $3, $4, $5, $6, $7)`, event.ID, nullableTime(event.OccurredAt), event.ActorID, event.TenantID, event.Action, event.Target, metadata)
	if err != nil {
		return fmt.Errorf("append audit event: %w", err)
	}
	return nil
}

func normalizeAuditFilter(filter *domain.AuditFilter) {
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 50
	}
	if filter.To.IsZero() {
		filter.To = time.Now().UTC()
	}
	if filter.From.IsZero() {
		filter.From = filter.To.AddDate(0, 0, -30)
	}
}

func auditQuery(filter *domain.AuditFilter) (query string, arguments []any, err error) {
	clauses := []string{"event.occurred_at >= $1", "event.occurred_at <= $2"}
	arguments = []any{filter.From, filter.To}
	appendFilter := func(column string, value any) {
		arguments = append(arguments, value)
		clauses = append(clauses, fmt.Sprintf("%s = $%d", column, len(arguments)))
	}
	if filter.ActorID != nil {
		appendFilter("event.actor_id", *filter.ActorID)
	}
	if filter.TenantID != nil {
		appendFilter("event.tenant_id", *filter.TenantID)
	}
	if filter.Action != "" {
		appendFilter("event.action", filter.Action)
	}
	if filter.Cursor != "" {
		occurredAt, id, err := parseAuditCursor(filter.Cursor)
		if err != nil {
			return "", nil, domain.NewError(domain.ErrorValidation)
		}
		arguments = append(arguments, occurredAt, id)
		clauses = append(clauses, fmt.Sprintf("(event.occurred_at, event.id) < ($%d, $%d)", len(arguments)-1, len(arguments)))
	}
	arguments = append(arguments, filter.PageSize+1)
	query = `SELECT event.id, event.occurred_at, event.actor_id, COALESCE(actor.email, ''), event.tenant_id,
		COALESCE(tenant.name, ''), event.action, event.target, event.metadata
		FROM audit_events event LEFT JOIN users actor ON actor.id = event.actor_id
		LEFT JOIN tenants tenant ON tenant.id = event.tenant_id WHERE ` + strings.Join(clauses, " AND ") +
		fmt.Sprintf(" ORDER BY event.occurred_at DESC, event.id DESC LIMIT $%d", len(arguments))
	return query, arguments, nil
}

func scanAuditEvent(scanner interface{ Scan(...any) error }) (domain.AuditEvent, error) {
	event := domain.AuditEvent{}
	var metadata []byte
	if err := scanner.Scan(&event.ID, &event.OccurredAt, &event.ActorID, &event.ActorEmail, &event.TenantID, &event.TenantName, &event.Action, &event.Target, &metadata); err != nil {
		return domain.AuditEvent{}, err
	}
	if err := json.Unmarshal(metadata, &event.Metadata); err != nil {
		return domain.AuditEvent{}, fmt.Errorf("decode audit metadata: %w", err)
	}
	return event, nil
}

func auditCursor(event *domain.AuditEvent) string {
	return base64.RawURLEncoding.EncodeToString([]byte(event.OccurredAt.UTC().Format(time.RFC3339Nano) + "|" + string(event.ID)))
}

func parseAuditCursor(cursor string) (time.Time, domain.AuditEventID, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, "", err
	}
	parts := strings.Split(string(decoded), "|")
	if len(parts) != 2 {
		return time.Time{}, "", fmt.Errorf("invalid cursor")
	}
	occurredAt, err := time.Parse(time.RFC3339Nano, parts[0])
	return occurredAt, domain.AuditEventID(parts[1]), err
}

func nullableTime(value time.Time) any {
	if value.IsZero() {
		return nil
	}
	return value
}

func sanitizeMetadata(metadata map[string]string) map[string]string {
	clean := make(map[string]string, len(metadata))
	for key, value := range metadata {
		lower := strings.ToLower(key)
		if strings.Contains(lower, "password") || strings.Contains(lower, "token") || strings.Contains(lower, "hash") {
			continue
		}
		clean[key] = value
	}
	return clean
}
