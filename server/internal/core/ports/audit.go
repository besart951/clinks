package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type AuditLog interface {
	Append(context.Context, *domain.AuditEvent) error
	List(context.Context, *domain.AuditFilter) (domain.AuditPage, error)
}
