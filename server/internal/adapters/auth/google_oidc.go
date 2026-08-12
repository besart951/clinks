package auth

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const (
	googleIssuer       = "https://accounts.google.com"
	defaultOIDCTimeout = 15 * time.Second
)

var (
	ErrOIDCDisabled       = errors.New("google oidc client is not enabled")
	ErrMissingIDToken     = errors.New("google response does not contain an id token")
	ErrInvalidTokenClaims = errors.New("invalid google id token claims")
)

type GoogleOIDCConfig struct {
	ClientID     string
	ClientSecret string
	CallbackURL  string
	Timeout      time.Duration
}

type GoogleOIDC struct {
	clientID string
	oauth    oauth2.Config
	timeout  time.Duration

	mu       sync.RWMutex
	verifier *oidc.IDTokenVerifier
}

type googleClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
}

func NewGoogleOIDC(config GoogleOIDCConfig) (*GoogleOIDC, error) {
	if err := validateGoogleOIDCConfig(config); err != nil {
		return nil, err
	}

	clientID := strings.TrimSpace(config.ClientID)
	if clientID == "" {
		return &GoogleOIDC{}, nil
	}

	timeout := config.Timeout
	if timeout <= 0 {
		timeout = defaultOIDCTimeout
	}

	return &GoogleOIDC{
		clientID: clientID,
		timeout:  timeout,
		oauth: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: config.ClientSecret,
			RedirectURL:  strings.TrimSpace(config.CallbackURL),
			Endpoint:     google.Endpoint,
			Scopes: []string{
				oidc.ScopeOpenID,
				oidc.ScopeEmail,
			},
		},
	}, nil
}

func (client *GoogleOIDC) Enabled() bool {
	return client.clientID != ""
}

func (client *GoogleOIDC) AuthorizationURL(
	state,
	nonce,
	verifier string,
) string {
	if !client.Enabled() {
		return ""
	}

	return client.oauth.AuthCodeURL(
		state,
		oidc.Nonce(nonce),
		oauth2.S256ChallengeOption(verifier),
	)
}

func (client *GoogleOIDC) Exchange(
	ctx context.Context,
	code,
	verifier,
	nonce string,
) (domain.ExternalIdentity, error) {
	if !client.Enabled() {
		return domain.ExternalIdentity{}, ErrOIDCDisabled
	}

	ctx, cancel := context.WithTimeout(ctx, client.timeout)
	defer cancel()

	oauthToken, err := client.oauth.Exchange(
		ctx,
		code,
		oauth2.VerifierOption(verifier),
	)
	if err != nil {
		return domain.ExternalIdentity{},
			fmt.Errorf("exchange google authorization code: %w", err)
	}

	rawIDToken, err := extractIDToken(oauthToken)
	if err != nil {
		return domain.ExternalIdentity{}, err
	}

	idTokenVerifier, err := client.getVerifier(ctx)
	if err != nil {
		return domain.ExternalIdentity{}, err
	}

	idToken, err := idTokenVerifier.Verify(ctx, rawIDToken)
	if err != nil {
		return domain.ExternalIdentity{},
			fmt.Errorf("verify google id token: %w", err)
	}

	if idToken.Nonce != nonce {
		return domain.ExternalIdentity{}, ErrInvalidTokenClaims
	}

	if idToken.Subject == "" {
		return domain.ExternalIdentity{}, ErrInvalidTokenClaims
	}

	if idToken.AccessTokenHash != "" {
		if err := idToken.VerifyAccessToken(oauthToken.AccessToken); err != nil {
			return domain.ExternalIdentity{},
				fmt.Errorf("verify google access token hash: %w", err)
		}
	}

	var claims googleClaims
	if err := idToken.Claims(&claims); err != nil {
		return domain.ExternalIdentity{},
			fmt.Errorf("decode google id token claims: %w", err)
	}

	if !claims.EmailVerified || strings.TrimSpace(claims.Email) == "" {
		return domain.ExternalIdentity{}, ErrInvalidTokenClaims
	}

	email, err := domain.ParseEmail(claims.Email)
	if err != nil {
		return domain.ExternalIdentity{},
			fmt.Errorf("parse google email: %w", err)
	}

	return domain.ExternalIdentity{
		Issuer:  googleIssuer,
		Subject: domain.ExternalSubject(idToken.Subject),
		Email:   email,
	}, nil
}

func (client *GoogleOIDC) getVerifier(
	ctx context.Context,
) (*oidc.IDTokenVerifier, error) {
	client.mu.RLock()
	verifier := client.verifier
	client.mu.RUnlock()

	if verifier != nil {
		return verifier, nil
	}

	client.mu.Lock()
	defer client.mu.Unlock()

	if client.verifier != nil {
		return client.verifier, nil
	}

	provider, err := oidc.NewProvider(ctx, googleIssuer)
	if err != nil {
		return nil, fmt.Errorf("discover google oidc provider: %w", err)
	}

	client.verifier = provider.Verifier(&oidc.Config{
		ClientID: client.clientID,
	})

	return client.verifier, nil
}

func extractIDToken(token *oauth2.Token) (string, error) {
	if token == nil {
		return "", ErrMissingIDToken
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || strings.TrimSpace(rawIDToken) == "" {
		return "", ErrMissingIDToken
	}

	return rawIDToken, nil
}

func validateGoogleOIDCConfig(config GoogleOIDCConfig) error {
	clientID := strings.TrimSpace(config.ClientID)
	clientSecret := strings.TrimSpace(config.ClientSecret)
	callbackURL := strings.TrimSpace(config.CallbackURL)

	// OIDC is completely optional; if nothing is provided, return early.
	if clientID == "" && clientSecret == "" && callbackURL == "" {
		return nil
	}

	// If any single field is provided, all three must be validly populated.
	if clientID == "" {
		return errors.New("google oidc client id is required when google oidc is configured")
	}

	if clientSecret == "" {
		return errors.New("google oidc client secret is required when google oidc is configured")
	}

	if callbackURL == "" {
		return errors.New("google oidc callback url is required when google oidc is configured")
	}

	parsedURL, err := url.Parse(callbackURL)
	if err != nil {
		return fmt.Errorf("parse google oidc callback url: %w", err)
	}

	// 1. Ensure the URL is absolute (contains a scheme)
	if !parsedURL.IsAbs() {
		return errors.New("google oidc callback url must be absolute (include http:// or https://)")
	}

	// 2. Validate scheme
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return errors.New("google oidc callback url scheme must be http or https")
	}

	// 3. Ensure hostname is present
	if parsedURL.Host == "" {
		return errors.New("google oidc callback url must contain a valid hostname")
	}

	// 4. Security checks: disallow embedded credentials and fragments
	if parsedURL.User != nil {
		return errors.New("google oidc callback url must not contain user information")
	}

	if parsedURL.Fragment != "" {
		return errors.New("google oidc callback url must not contain a fragment")
	}

	return nil
}
