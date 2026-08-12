package http

import (
	"testing"
	"time"
)

func TestIdentityRateLimiterExpiresAndCleansEntries(t *testing.T) {
	now := time.Date(2026, time.August, 12, 9, 0, 0, 0, time.UTC)
	limiter := newIdentityRateLimiter(2, time.Minute)
	limiter.nowFunc = func() time.Time { return now }

	if !limiter.allow(" User@Example.com ") || !limiter.allow("user@example.com") {
		t.Fatal("allow() rejected request before limit")
	}
	if limiter.allow("USER@EXAMPLE.COM") {
		t.Fatal("allow() accepted request over limit")
	}

	now = now.Add(time.Minute)
	if !limiter.allow("user@example.com") {
		t.Fatal("allow() did not expire entries at the window boundary")
	}

	now = now.Add(time.Minute)
	limiter.cleanup()
	if len(limiter.entries) != 0 {
		t.Fatalf("cleanup() retained expired entries: %v", limiter.entries)
	}
}
