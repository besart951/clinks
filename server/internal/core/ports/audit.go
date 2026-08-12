package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type AuditAppender interface {
	Append(
		ctx context.Context,
		event domain.AuditEvent,
	) error
}

type AuditReader interface {
	ListAuditEvents(
		ctx context.Context,
		filter domain.AuditFilter,
	) (domain.AuditPage, error)
}
