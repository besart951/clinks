package service

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type AuditAdministration struct{ audit ports.AuditReader }

func NewAuditAdministration(audit ports.AuditReader) *AuditAdministration {
	return &AuditAdministration{audit: audit}
}

func (administration *AuditAdministration) AuditEvents(ctx context.Context, filter *domain.AuditFilter) (domain.AuditPage, error) {
	normalized := domain.AuditFilter{PageSize: domain.DefaultPageSize, Direction: domain.SortDescending}
	if filter != nil {
		normalized = *filter
	}
	var err error
	normalized, err = normalized.Normalized()
	if err != nil {
		return domain.AuditPage{}, err
	}
	return administration.audit.ListAuditEvents(ctx, normalized)
}
