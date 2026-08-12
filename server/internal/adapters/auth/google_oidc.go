package auth

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const googleIssuer = "https://accounts.google.com"

var (
	ErrOIDCDisabled       = errors.New("google oidc client is not enabled")
	ErrMissingIDToken     = errors.New("google response does not contain an id token")
	ErrInvalidTokenClaims = errors.New("invalid google id token claims")
)

type GoogleOIDCConfig struct {
	ClientID     string
	ClientSecret string
	CallbackURL  string
}

type GoogleOIDC struct {
	config GoogleOIDCConfig
	oauth  oauth2.Config

	mu       sync.RWMutex
	provider *oidc.Provider
}

type googleClaims struct {
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Nonce         string `json:"nonce"`
}

func NewGoogleOIDC(config GoogleOIDCConfig) *GoogleOIDC {
	return &GoogleOIDC{
		config: config,
		oauth: oauth2.Config{
			ClientID:     config.ClientID,
			ClientSecret: config.ClientSecret,
			RedirectURL:  config.CallbackURL,
			// #nosec G101 -- Public endpoints for Google OIDC protocol.
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
				TokenURL: "https://oauth2.googleapis.com/token",
			},
			Scopes: []string{oidc.ScopeOpenID, "email"},
		},
	}
}

func (client *GoogleOIDC) Enabled() bool {
	return client.config.ClientID != ""
}

func (client *GoogleOIDC) AuthorizationURL(state, nonce, verifier string) string {
	if !client.Enabled() {
		return ""
	}
	return client.oauth.AuthCodeURL(
		state,
		oidc.Nonce(nonce),
		oauth2.S256ChallengeOption(verifier),
	)
}

func (client *GoogleOIDC) Exchange(ctx context.Context, code, verifier, nonce string) (domain.ExternalIdentity, error) {
	if !client.Enabled() {
		return domain.ExternalIdentity{}, ErrOIDCDisabled
	}

	token, err := client.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return domain.ExternalIdentity{}, fmt.Errorf("exchange google authorization code: %w", err)
	}

	rawToken, ok := token.Extra("id_token").(string)
	if !ok || rawToken == "" {
		return domain.ExternalIdentity{}, ErrMissingIDToken
	}

	oidcProvider, err := client.getProvider(ctx)
	if err != nil {
		return domain.ExternalIdentity{}, err
	}

	verifierConfig := &oidc.Config{ClientID: client.config.ClientID}
	idToken, err := oidcProvider.Verifier(verifierConfig).Verify(ctx, rawToken)
	if err != nil {
		return domain.ExternalIdentity{}, fmt.Errorf("verify google id token: %w", err)
	}

	if verifyErr := idToken.VerifyAccessToken(token.AccessToken); verifyErr != nil {
		return domain.ExternalIdentity{}, fmt.Errorf("verify google access token hash: %w", verifyErr)
	}

	var claims googleClaims
	if claimsErr := idToken.Claims(&claims); claimsErr != nil {
		return domain.ExternalIdentity{}, fmt.Errorf("decode google id token claims: %w", claimsErr)
	}

	if claims.Nonce != nonce || !claims.EmailVerified || claims.Subject == "" {
		return domain.ExternalIdentity{}, ErrInvalidTokenClaims
	}

	email, err := domain.ParseEmail(claims.Email)
	if err != nil {
		return domain.ExternalIdentity{}, fmt.Errorf("parse google email: %w", err)
	}

	return domain.ExternalIdentity{
		Issuer:  googleIssuer,
		Subject: domain.ExternalSubject(claims.Subject),
		Email:   email,
	}, nil
}

func (client *GoogleOIDC) getProvider(ctx context.Context) (*oidc.Provider, error) {
	client.mu.RLock()
	if client.provider != nil {
		provider := client.provider
		client.mu.RUnlock()
		return provider, nil
	}
	client.mu.RUnlock()

	client.mu.Lock()
	defer client.mu.Unlock()

	if client.provider != nil {
		return client.provider, nil
	}

	provider, err := oidc.NewProvider(ctx, googleIssuer)
	if err != nil {
		return nil, fmt.Errorf("discover google oidc provider: %w", err)
	}

	client.provider = provider
	return client.provider, nil
}
