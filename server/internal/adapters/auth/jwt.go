// Package auth provides authentication infrastructure adapters.
package auth

import (
	"bytes"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const (
	defaultSessionTTL         = 24 * time.Hour
	minimumSessionSecretBytes = 32
)

type SessionConfig struct {
	Secret   []byte
	Issuer   string
	Audience string
	TTL      time.Duration
	Clock    func() time.Time
}

type SessionIssuer struct {
	secret   []byte
	issuer   string
	audience string
	ttl      time.Duration
	clock    func() time.Time
}

type sessionClaims struct {
	TenantID string `json:"tenant_id,omitempty"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	Locale   string `json:"locale"`
	Version  int    `json:"version"`

	jwt.RegisteredClaims
}

func NewSessionIssuer(
	config SessionConfig,
) (*SessionIssuer, error) {
	if len(config.Secret) < minimumSessionSecretBytes {
		return nil, fmt.Errorf(
			"session issuer secret must contain at least %d bytes",
			minimumSessionSecretBytes,
		)
	}

	issuerName := strings.TrimSpace(config.Issuer)
	if issuerName == "" {
		return nil, errors.New(
			"session issuer is required",
		)
	}

	audience := strings.TrimSpace(config.Audience)
	if audience == "" {
		return nil, errors.New(
			"session audience is required",
		)
	}

	ttl := config.TTL
	if ttl <= 0 {
		ttl = defaultSessionTTL
	}

	clock := config.Clock
	if clock == nil {
		clock = time.Now
	}

	return &SessionIssuer{
		secret:   bytes.Clone(config.Secret),
		issuer:   issuerName,
		audience: audience,
		ttl:      ttl,
		clock:    clock,
	}, nil
}

func (issuer *SessionIssuer) Issue(
	claim *domain.SessionClaim,
) (string, error) {
	if err := validateSessionClaim(claim); err != nil {
		return "", err
	}

	now := issuer.clock().UTC()

	tokenID, err := newTokenID()
	if err != nil {
		return "", fmt.Errorf(
			"generate session token id: %w",
			err,
		)
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

	token := jwt.NewWithClaims(
		jwt.SigningMethodHS256,
		claims,
	)

	signedToken, err := token.SignedString(issuer.secret)
	if err != nil {
		return "", fmt.Errorf(
			"sign session token: %w",
			err,
		)
	}

	return signedToken, nil
}

func (issuer *SessionIssuer) Verify(
	rawToken string,
) (domain.SessionClaim, error) {
	if strings.TrimSpace(rawToken) == "" {
		return invalidSessionClaim()
	}

	var claims sessionClaims

	token, err := jwt.ParseWithClaims(
		rawToken,
		&claims,
		func(_ *jwt.Token) (any, error) {
			return issuer.secret, nil
		},
		jwt.WithValidMethods(
			[]string{jwt.SigningMethodHS256.Alg()},
		),
		jwt.WithIssuer(issuer.issuer),
		jwt.WithAudience(issuer.audience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithStrictDecoding(),
		jwt.WithTimeFunc(issuer.clock),
	)
	if err != nil || token == nil || !token.Valid {
		return invalidSessionClaim()
	}

	if !validSessionClaims(&claims) {
		return invalidSessionClaim()
	}

	email, err := domain.ParseEmail(claims.Email)
	if err != nil {
		return invalidSessionClaim()
	}

	user := domain.User{
		ID:             domain.UserID(claims.Subject),
		Email:          email,
		Role:           domain.Role(claims.Role),
		Locale:         domain.NewLocale(claims.Locale),
		SessionVersion: claims.Version,
	}

	claim := domain.SessionClaim{
		User: user,
	}

	if claims.TenantID != "" {
		claim.ActiveTenantID = new(
			domain.TenantID(claims.TenantID),
		)
	}

	return claim, nil
}

func validateSessionClaim(
	claim *domain.SessionClaim,
) error {
	if claim == nil {
		return errors.New(
			"issue session token: claim cannot be nil",
		)
	}

	if claim.User.ID == "" {
		return errors.New(
			"issue session token: user id is required",
		)
	}

	if claim.User.Email == "" {
		return errors.New(
			"issue session token: user email is required",
		)
	}

	if claim.User.Role == "" {
		return errors.New(
			"issue session token: user role is required",
		)
	}

	if claim.User.Locale == "" {
		return errors.New(
			"issue session token: user locale is required",
		)
	}

	if claim.User.SessionVersion < 1 {
		return errors.New(
			"issue session token: session version must be positive",
		)
	}

	return nil
}

func validSessionClaims(
	claims *sessionClaims,
) bool {
	return claims != nil &&
		claims.Subject != "" &&
		claims.ID != "" &&
		claims.Email != "" &&
		claims.Role != "" &&
		claims.Locale != "" &&
		claims.Version > 0 &&
		claims.IssuedAt != nil &&
		claims.ExpiresAt != nil
}

func invalidSessionClaim() (
	domain.SessionClaim,
	error,
) {
	return domain.SessionClaim{},
		domain.NewError(domain.ErrorInvalidCredentials)
}

func newTokenID() (string, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return "", err
	}

	return id.String(), nil
}
