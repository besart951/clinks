package domain

import (
	"strings"
	"time"
)

type AuditEventID string

func (eventID AuditEventID) IsValid() bool {
	return validUUID(string(eventID))
}

func (eventID AuditEventID) Validate() error {
	if !eventID.IsValid() {
		return NewError(ErrorValidation)
	}
	return nil
}

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
	From      time.Time
	To        time.Time
	ActorID   *UserID
	TenantID  *TenantID
	Action    string
	Search    string
	Direction SortDirection
	Cursor    Cursor
	PageSize  int
}

type AuditPage struct {
	Events     []AuditEvent
	NextCursor Cursor
}

func (filter AuditFilter) Normalized() (AuditFilter, error) {
	filter.Action = strings.TrimSpace(filter.Action)
	search, err := NormalizeSearch(filter.Search)
	if err != nil || !filter.Direction.IsValid() ||
		!filter.From.IsZero() && !filter.To.IsZero() && filter.From.After(filter.To) ||
		filter.ActorID != nil && !filter.ActorID.IsValid() ||
		filter.TenantID != nil && !filter.TenantID.IsValid() {
		return AuditFilter{}, NewError(ErrorValidation)
	}
	filter.Search = search
	filter.PageSize = EffectiveLimit(filter.PageSize)
	return filter, nil
}
