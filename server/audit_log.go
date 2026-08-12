package clinks

import (
	"context"
)

type AuditLog struct{ audit AuditReader }

func NewAuditLog(audit AuditReader) *AuditLog {
	return &AuditLog{audit: audit}
}

func (administration *AuditLog) AuditEvents(ctx context.Context, filter *AuditFilter) (AuditPage, error) {
	normalized := AuditFilter{PageSize: DefaultPageSize, Direction: SortDescending}
	if filter != nil {
		normalized = *filter
	}
	var err error
	normalized, err = normalized.Normalized()
	if err != nil {
		return AuditPage{}, err
	}
	return administration.audit.ListAuditEvents(ctx, normalized)
}
