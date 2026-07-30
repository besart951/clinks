package http

import (
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
	kept := entries[:0]
	for _, entry := range entries {
		if entry.After(cutoff) {
			kept = append(kept, entry)
		}
	}
	if len(kept) >= limiter.limit {
		limiter.entries[key] = kept
		return false
	}
	limiter.entries[key] = append(kept, now)
	return true
}
