// Package auth provides authentication infrastructure adapters.
package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type SessionIssuer struct {
	secret   []byte
	issuer   string
	audience string
	ttl      time.Duration
	clock    func() time.Time
}

type SessionConfig struct {
	Secret   []byte
	Issuer   string
	Audience string
	TTL      time.Duration
	Clock    func() time.Time
}

type sessionClaims struct {
	TenantID string `json:"tenant_id,omitempty"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	Locale   string `json:"locale"`
	Version  int    `json:"version"`
	jwt.RegisteredClaims
}

func NewSessionIssuer(config SessionConfig) *SessionIssuer {
	clock := config.Clock
	if clock == nil {
		clock = time.Now
	}
	return &SessionIssuer{
		secret: config.Secret, issuer: config.Issuer,
		audience: config.Audience, ttl: config.TTL, clock: clock,
	}
}

func (issuer *SessionIssuer) Issue(claim *domain.SessionClaim) (string, error) {
	now := issuer.clock()
	claims := sessionClaims{
		Email: string(claim.User.Email), Role: string(claim.User.Role), Locale: string(claim.User.Locale),
		Version: claim.User.SessionVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: string(claim.User.ID), Issuer: issuer.issuer,
			Audience:  jwt.ClaimStrings{issuer.audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(issuer.ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        newTokenID(),
		},
	}
	if claim.ActiveTenantID != nil {
		claims.TenantID = string(*claim.ActiveTenantID)
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(issuer.secret)
}

func (issuer *SessionIssuer) Verify(token string) (domain.SessionClaim, error) {
	var parsed sessionClaims
	_, err := jwt.ParseWithClaims(token, &parsed, func(value *jwt.Token) (any, error) {
		if value.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected JWT signing algorithm")
		}
		return issuer.secret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(issuer.issuer), jwt.WithAudience(issuer.audience),
		jwt.WithExpirationRequired(), jwt.WithIssuedAt(), jwt.WithTimeFunc(issuer.clock))
	if err != nil {
		return domain.SessionClaim{}, domain.NewError(domain.ErrorUnauthorized)
	}
	if parsed.Subject == "" || parsed.Version < 1 || parsed.ID == "" {
		return domain.SessionClaim{}, domain.NewError(domain.ErrorUnauthorized)
	}
	user := domain.User{
		ID: domain.UserID(parsed.Subject), Email: domain.Email(parsed.Email),
		Role: domain.Role(parsed.Role), Locale: domain.Locale(parsed.Locale),
		SessionVersion: parsed.Version,
	}
	claim := domain.SessionClaim{User: user}
	if parsed.TenantID != "" {
		claim.ActiveTenantID = new(domain.TenantID(parsed.TenantID))
	}
	return claim, nil
}

func newTokenID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}
