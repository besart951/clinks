package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type ReadinessChecker interface {
	Ready(ctx context.Context) error
}

type SystemStatsRepository interface {
	Stats(
		ctx context.Context,
	) (domain.SystemStats, error)
}
