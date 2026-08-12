package clinks

import (
	"context"
)

type AuditAppender interface {
	Append(
		ctx context.Context,
		event AuditEvent,
	) error
}

type AuditReader interface {
	ListAuditEvents(
		ctx context.Context,
		filter AuditFilter,
	) (AuditPage, error)
}
