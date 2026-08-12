package http

import (
	"context"
	"strings"
	"sync"
	"time"
)

type identityRateLimiter struct {
	mu      sync.Mutex
	entries map[string][]time.Time
	limit   int
	window  time.Duration
	nowFunc func() time.Time
}

func newIdentityRateLimiter(limit int, window time.Duration) *identityRateLimiter {
	if limit <= 0 {
		limit = 5
	}
	if window <= 0 {
		window = 10 * time.Minute
	}

	return &identityRateLimiter{
		entries: make(map[string][]time.Time),
		limit:   limit,
		window:  window,
		nowFunc: time.Now,
	}
}

func (limiter *identityRateLimiter) allow(key string) bool {
	now := limiter.nowFunc()
	key = strings.ToLower(strings.TrimSpace(key))
	cutoff := now.Add(-limiter.window)

	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	entries := trimExpired(limiter.entries[key], cutoff)

	if len(entries) >= limiter.limit {
		limiter.entries[key] = entries
		return false
	}

	limiter.entries[key] = append(entries, now)
	return true
}

func (limiter *identityRateLimiter) runCleanup(ctx context.Context) {
	ticker := time.NewTicker(limiter.window)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			limiter.cleanup()
		}
	}
}

func (limiter *identityRateLimiter) cleanup() {
	now := limiter.nowFunc()
	cutoff := now.Add(-limiter.window)

	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	for key, entries := range limiter.entries {
		trimmed := trimExpired(entries, cutoff)
		if len(trimmed) == 0 {
			delete(limiter.entries, key)
		} else {
			limiter.entries[key] = trimmed
		}
	}
}

func trimExpired(entries []time.Time, cutoff time.Time) []time.Time {
	for i, entry := range entries {
		if entry.After(cutoff) {
			return entries[i:]
		}
	}
	return nil
}
