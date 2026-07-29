package postgres_test

import (
	"context"
	"testing"
	"time"

	"github.com/besartmorina/clinks/server/internal/adapters/postgres"
)

func TestPoolConfig_InvalidURL(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	config := postgres.PoolConfig{
		DatabaseURL: "invalid://dsn",
	}

	_, err := postgres.NewPool(ctx, config)
	if err == nil {
		t.Error("expected error when parsing invalid database URL, got nil")
	}
}
