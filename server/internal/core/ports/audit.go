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
	List(
		ctx context.Context,
		filter domain.AuditFilter,
	) (domain.AuditPage, error)
}

// AuditLog combines audit writing and querying for consumers that
// genuinely require both capabilities.
type AuditLog interface {
	AuditAppender
	AuditReader
}
