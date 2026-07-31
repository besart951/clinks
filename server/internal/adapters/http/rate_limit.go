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
}

func newIdentityRateLimiter(limit int, window time.Duration) *identityRateLimiter {
	return &identityRateLimiter{entries: make(map[string][]time.Time), limit: limit, window: window}
}

func (limiter *identityRateLimiter) allow(key string) bool {
	now := time.Now()
	key = strings.ToLower(strings.TrimSpace(key))
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	entries := limiter.entries[key]
	cutoff := now.Add(-limiter.window)
	limiter.entries[key] = trimExpired(entries, cutoff)
	if len(limiter.entries[key]) >= limiter.limit {
		return false
	}
	limiter.entries[key] = append(limiter.entries[key], now)
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
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	cutoff := time.Now().Add(-limiter.window)
	for key, entries := range limiter.entries {
		limiter.entries[key] = trimExpired(entries, cutoff)
		if len(limiter.entries[key]) == 0 {
			delete(limiter.entries, key)
		}
	}
}

func trimExpired(entries []time.Time, cutoff time.Time) []time.Time {
	kept := entries[:0]
	for _, entry := range entries {
		if entry.After(cutoff) {
			kept = append(kept, entry)
		}
	}
	return kept
}
