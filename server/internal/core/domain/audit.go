package domain

import "time"

type AuditEventID string

type AuditEvent struct {
	ID         AuditEventID
	OccurredAt time.Time
	ActorID    *UserID
	ActorEmail string
	TenantID   *TenantID
	TenantName string
	Action     string
	Target     string
	Metadata   map[string]string
}

type AuditFilter struct {
	From     time.Time
	To       time.Time
	ActorID  *UserID
	TenantID *TenantID
	Action   string
	Search   string
	Cursor   string
	PageSize int
}

type AuditPage struct {
	Events     []AuditEvent
	NextCursor string
}
