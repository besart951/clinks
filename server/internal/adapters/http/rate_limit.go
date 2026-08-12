package http

import (
	"sync"
	"time"
)

const (
	defaultRateLimit  = 5
	defaultRateWindow = 10 * time.Minute
)

type rateLimiter struct {
	mu sync.Mutex

	entries map[string][]time.Time
	limit   int
	window  time.Duration

	nextCleanup time.Time
	now         func() time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	if limit <= 0 {
		limit = defaultRateLimit
	}
	if window <= 0 {
		window = defaultRateWindow
	}

	return &rateLimiter{
		entries: make(map[string][]time.Time),
		limit:   limit,
		window:  window,
		now:     time.Now,
	}
}

func (limiter *rateLimiter) allow(key string) (bool, time.Duration) {
	now := limiter.now()
	cutoff := now.Add(-limiter.window)

	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	if limiter.nextCleanup.IsZero() || !now.Before(limiter.nextCleanup) {
		limiter.cleanupLocked(cutoff)
		limiter.nextCleanup = now.Add(limiter.window / 2)
	}

	entries := trimExpired(limiter.entries[key], cutoff)
	if len(entries) >= limiter.limit {
		limiter.entries[key] = entries
		retryAfter := max(entries[0].Add(limiter.window).Sub(now), 0)
		return false, retryAfter
	}

	limiter.entries[key] = append(entries, now)
	return true, 0
}

func (limiter *rateLimiter) reset(key string) {
	limiter.mu.Lock()
	delete(limiter.entries, key)
	limiter.mu.Unlock()
}

func (limiter *rateLimiter) cleanupLocked(cutoff time.Time) {
	for key, entries := range limiter.entries {
		entries = trimExpired(entries, cutoff)
		if len(entries) == 0 {
			delete(limiter.entries, key)
			continue
		}

		limiter.entries[key] = entries
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
