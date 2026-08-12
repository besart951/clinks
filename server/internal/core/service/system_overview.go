package service

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type SystemOverview struct{ stats ports.SystemStatsRepository }

func NewSystemOverview(stats ports.SystemStatsRepository) *SystemOverview {
	return &SystemOverview{stats: stats}
}

func (overview *SystemOverview) Stats(ctx context.Context) (domain.SystemStats, error) {
	return overview.stats.Stats(ctx)
}
