package auth

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func TestSessionIssuerRoundTripsActiveTenant(t *testing.T) {
	now := time.Date(2026, time.July, 29, 9, 0, 0, 0, time.UTC)
	issuer, err := NewSessionIssuer(SessionConfig{Secret: []byte("01234567890123456789012345678901"), Issuer: "clinks", Audience: "clinks-web", TTL: time.Minute, Clock: func() time.Time { return now }})
	if err != nil {
		t.Fatalf("NewSessionIssuer() error = %v", err)
	}
	want := domain.SessionClaim{User: domain.User{ID: "user-1", Email: "user@example.com", Role: domain.RoleTenantAdmin, Locale: "de-CH", SessionVersion: 1}, ActiveTenantID: new(domain.TenantID("tenant-1"))}
	token, err := issuer.Issue(&want)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}
	got, err := issuer.Verify(token)
	if err != nil {
		t.Fatalf("Verify() error = %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Verify() claim = %#v, want %#v", got, want)
	}

	var claims sessionClaims
	if _, _, parseErr := jwt.NewParser().ParseUnverified(token, &claims); parseErr != nil {
		t.Fatalf("ParseUnverified() error = %v", parseErr)
	}
	tokenID, err := uuid.Parse(claims.ID)
	if err != nil || tokenID.Version() != 7 {
		t.Fatalf("token ID = %q, want UUIDv7", claims.ID)
	}
}

func TestSessionIssuerRejectsExpiredTokenUsingInjectedClock(t *testing.T) {
	now := time.Date(2026, time.July, 29, 9, 0, 0, 0, time.UTC)
	issuer, err := NewSessionIssuer(SessionConfig{Secret: []byte("01234567890123456789012345678901"), Issuer: "clinks", Audience: "clinks-web", TTL: time.Minute, Clock: func() time.Time { return now }})
	if err != nil {
		t.Fatalf("NewSessionIssuer() error = %v", err)
	}
	claim := domain.SessionClaim{User: domain.User{ID: "user-1", SessionVersion: 1}}
	token, err := issuer.Issue(&claim)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}
	issuer.clock = func() time.Time { return now.Add(time.Minute + time.Second) }
	_, err = issuer.Verify(token)
	var domainError *domain.Error
	if !errors.As(err, &domainError) || domainError.Kind != domain.ErrorUnauthorized {
		t.Fatalf("Verify() error = %v, want unauthorized domain error", err)
	}
}

func TestNewSessionIssuerRejectsShortSecret(t *testing.T) {
	issuer, err := NewSessionIssuer(SessionConfig{Secret: []byte("too-short")})
	if err == nil || issuer != nil {
		t.Fatalf("NewSessionIssuer() = (%v, %v), want (nil, error)", issuer, err)
	}
}

func TestSessionIssuerRejectsNilClaim(t *testing.T) {
	issuer, err := NewSessionIssuer(SessionConfig{Secret: []byte("01234567890123456789012345678901")})
	if err != nil {
		t.Fatalf("NewSessionIssuer() error = %v", err)
	}
	if _, err := issuer.Issue(nil); err == nil {
		t.Fatal("Issue(nil) error = nil, want error")
	}
}
