// Package auth provides authentication infrastructure adapters.
package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const defaultSessionTTL = 24 * time.Hour

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

func NewSessionIssuer(config SessionConfig) (*SessionIssuer, error) {
	if len(config.Secret) < 32 {
		return nil, fmt.Errorf("session issuer secret must contain at least 32 bytes")
	}

	clock := config.Clock
	if clock == nil {
		clock = time.Now
	}

	ttl := config.TTL
	if ttl <= 0 {
		ttl = defaultSessionTTL
	}

	return &SessionIssuer{
		secret:   config.Secret,
		issuer:   config.Issuer,
		audience: config.Audience,
		ttl:      ttl,
		clock:    clock,
	}, nil
}

func (issuer *SessionIssuer) Issue(claim *domain.SessionClaim) (string, error) {
	if claim == nil {
		return "", fmt.Errorf("issue session token: claim cannot be nil")
	}

	now := issuer.clock()
	tokenID, err := newTokenID()
	if err != nil {
		return "", fmt.Errorf("generate session token id: %w", err)
	}

	claims := sessionClaims{
		Email:   string(claim.User.Email),
		Role:    string(claim.User.Role),
		Locale:  string(claim.User.Locale),
		Version: claim.User.SessionVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   string(claim.User.ID),
			Issuer:    issuer.issuer,
			Audience:  jwt.ClaimStrings{issuer.audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(issuer.ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        tokenID,
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
	_, err := jwt.ParseWithClaims(
		token,
		&parsed,
		func(value *jwt.Token) (any, error) {
			if value.Method != jwt.SigningMethodHS256 {
				return nil, fmt.Errorf("unexpected JWT signing algorithm: %v", value.Header["alg"])
			}
			return issuer.secret, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(issuer.issuer),
		jwt.WithAudience(issuer.audience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithTimeFunc(issuer.clock),
	)
	if err != nil {
		return domain.SessionClaim{}, domain.NewError(domain.ErrorUnauthorized)
	}

	if parsed.Subject == "" || parsed.Version < 1 || parsed.ID == "" {
		return domain.SessionClaim{}, domain.NewError(domain.ErrorUnauthorized)
	}

	user := domain.User{
		ID:             domain.UserID(parsed.Subject),
		Email:          domain.Email(parsed.Email),
		Role:           domain.Role(parsed.Role),
		Locale:         domain.Locale(parsed.Locale),
		SessionVersion: parsed.Version,
	}

	claim := domain.SessionClaim{User: user}
	if parsed.TenantID != "" {
		claim.ActiveTenantID = new(domain.TenantID(parsed.TenantID))
	}

	return claim, nil
}

func newTokenID() (string, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return "", err
	}
	return id.String(), nil
}
