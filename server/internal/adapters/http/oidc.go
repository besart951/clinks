package http

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	stdhttp "net/http"
	"net/url"
	"strings"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const (
	oidcCookieName             = "clinks_oidc"
	passwordVerifiedCookieName = "clinks_password_verified"
	oidcAttemptMaxAgeSeconds   = 600 // 10 minutes
)

// --- Types & Interfaces ---

type OIDCConfig struct {
	StateSecret string
	SuccessURL  string
}

type oidcClient interface {
	Enabled() bool
	AuthorizationURL(state, nonce, verifier string) string
	Exchange(ctx context.Context, code, verifier, nonce string) (domain.ExternalIdentity, error)
}

type oidcSessionService interface {
	LoginExternal(ctx context.Context, identity domain.ExternalIdentity) (domain.Session, error)
	LinkExternalIdentity(ctx context.Context, sessionToken string, identity domain.ExternalIdentity) error
	AcceptExternalInvitation(ctx context.Context, invitationToken string, identity domain.ExternalIdentity, locale domain.Locale) (domain.Session, error)
}

type oidcAttempt struct {
	State           string `json:"state"`
	Nonce           string `json:"nonce"`
	Verifier        string `json:"verifier"`
	Mode            string `json:"mode"`
	InvitationToken string `json:"invitation_token,omitempty"`
	ExpiresAt       int64  `json:"expires_at"`
}

// --- Handlers ---

func (server *Server) googleOIDCStart(client oidcClient, config OIDCConfig) stdhttp.HandlerFunc {
	return func(response stdhttp.ResponseWriter, request *stdhttp.Request) {
		_, ok := server.sessions.(oidcSessionService)
		if !ok || len(config.StateSecret) < 32 {
			stdhttp.NotFound(response, request)
			return
		}

		mode := request.URL.Query().Get("mode")
		switch mode {
		case "link":
			if _, err := server.sessions.CurrentSession(request.Context(), server.cookieToken(request.Header)); err != nil || !server.hasPasswordVerified(request) {
				server.oidcFailure(response, request, config)
				return
			}
		case "invite":
			if strings.TrimSpace(request.URL.Query().Get("token")) == "" {
				server.oidcFailure(response, request, config)
				return
			}
		case "", "login":
			mode = "login"
		default:
			server.oidcFailure(response, request, config)
			return
		}

		attempt, err := newOIDCAttempt(mode)
		if err != nil {
			server.oidcFailure(response, request, config)
			return
		}
		if mode == "invite" {
			attempt.InvitationToken = request.URL.Query().Get("token")
		}

		sealedValue, err := sealOIDCAttempt(config.StateSecret, &attempt)
		if err != nil {
			server.oidcFailure(response, request, config)
			return
		}

		stdhttp.SetCookie(response, server.oidcAttemptCookie(sealedValue))
		stdhttp.Redirect(response, request, client.AuthorizationURL(attempt.State, attempt.Nonce, attempt.Verifier), stdhttp.StatusFound)
	}
}

func (server *Server) googleOIDCCallback(client oidcClient, config OIDCConfig) stdhttp.HandlerFunc {
	return func(response stdhttp.ResponseWriter, request *stdhttp.Request) {
		cookie, err := request.Cookie(oidcCookieName)
		if err != nil || request.URL.Query().Get("error") != "" {
			server.oidcFailure(response, request, config)
			return
		}

		attempt, err := openOIDCAttempt(config.StateSecret, cookie.Value)
		if err != nil || attempt.State != request.URL.Query().Get("state") {
			server.oidcFailure(response, request, config)
			return
		}

		auth, ok := server.sessions.(oidcSessionService)
		if !ok {
			server.oidcFailure(response, request, config)
			return
		}

		identity, err := client.Exchange(request.Context(), request.URL.Query().Get("code"), attempt.Verifier, attempt.Nonce)
		if err != nil {
			server.oidcFailure(response, request, config)
			return
		}

		limiterKey := fmt.Sprintf("oidc:%s:%s", identity.Issuer, identity.Subject)
		if !server.authLimiter.allow(limiterKey) {
			server.oidcFailure(response, request, config)
			return
		}

		switch attempt.Mode {
		case "link":
			err = auth.LinkExternalIdentity(request.Context(), server.cookieToken(request.Header), identity)
		case "invite":
			var session domain.Session
			session, err = auth.AcceptExternalInvitation(request.Context(), attempt.InvitationToken, identity, requestLocale(request.Header))
			if err == nil {
				response.Header().Add("Set-Cookie", server.sessionCookie(session.Token).String())
			}
		default:
			var session domain.Session
			session, err = auth.LoginExternal(request.Context(), identity)
			if err == nil {
				response.Header().Add("Set-Cookie", server.sessionCookie(session.Token).String())
			}
		}

		if err != nil {
			server.oidcFailure(response, request, config)
			return
		}

		stdhttp.SetCookie(response, server.clearOIDCAttemptCookie())
		stdhttp.Redirect(response, request, config.SuccessURL, stdhttp.StatusFound)
	}
}

func (server *Server) oidcFailure(response stdhttp.ResponseWriter, request *stdhttp.Request, config OIDCConfig) {
	target, err := url.Parse(config.SuccessURL)
	if err != nil || target.Scheme == "" || target.Host == "" {
		stdhttp.Error(response, "authentication failed", stdhttp.StatusUnauthorized)
		return
	}

	query := target.Query()
	query.Set("error", "authentication_failed")
	target.RawQuery = query.Encode()

	stdhttp.Redirect(response, request, target.String(), stdhttp.StatusFound)
}

// --- Encryption & Sealing Helpers ---

func newOIDCAttempt(mode string) (oidcAttempt, error) {
	state, err := randomOIDCValue(32)
	if err != nil {
		return oidcAttempt{}, err
	}
	nonce, err := randomOIDCValue(32)
	if err != nil {
		return oidcAttempt{}, err
	}
	verifier, err := randomOIDCValue(48)
	if err != nil {
		return oidcAttempt{}, err
	}

	return oidcAttempt{
		State:     state,
		Nonce:     nonce,
		Verifier:  verifier,
		Mode:      mode,
		ExpiresAt: time.Now().Add(10 * time.Minute).Unix(),
	}, nil
}

func randomOIDCValue(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func sealOIDCAttempt(secret string, attempt *oidcAttempt) (string, error) {
	if len(secret) < 32 {
		return "", stdhttp.ErrNoCookie
	}

	key := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}

	payload, err := json.Marshal(attempt)
	if err != nil {
		return "", err
	}

	sealed := gcm.Seal(nil, nonce, payload, nil)
	return base64.RawURLEncoding.EncodeToString(append(nonce, sealed...)), nil
}

func openOIDCAttempt(secret, value string) (oidcAttempt, error) {
	if len(secret) < 32 {
		return oidcAttempt{}, stdhttp.ErrNoCookie
	}

	encoded, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return oidcAttempt{}, err
	}

	key := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return oidcAttempt{}, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return oidcAttempt{}, err
	}

	if len(encoded) < gcm.NonceSize() {
		return oidcAttempt{}, stdhttp.ErrNoCookie
	}

	nonce := encoded[:gcm.NonceSize()]
	ciphertext := encoded[gcm.NonceSize():]

	payload, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return oidcAttempt{}, err
	}

	var attempt oidcAttempt
	if err := json.Unmarshal(payload, &attempt); err != nil {
		return oidcAttempt{}, err
	}

	if attempt.ExpiresAt < time.Now().Unix() || attempt.State == "" || attempt.Nonce == "" || attempt.Verifier == "" {
		return oidcAttempt{}, stdhttp.ErrNoCookie
	}

	return attempt, nil
}

// --- Cookie & HMAC Helpers ---

func (server *Server) oidcAttemptCookie(value string) *stdhttp.Cookie {
	//nolint:gosec // Secure may be disabled only by explicit local-development configuration.
	return &stdhttp.Cookie{
		Name:     oidcCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   server.cookie.Secure,
		SameSite: stdhttp.SameSiteLaxMode,
		MaxAge:   oidcAttemptMaxAgeSeconds,
	}
}

func (server *Server) clearOIDCAttemptCookie() *stdhttp.Cookie {
	//nolint:gosec // Secure may be disabled only by explicit local-development configuration.
	return &stdhttp.Cookie{
		Name:     oidcCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   server.cookie.Secure,
		SameSite: stdhttp.SameSiteLaxMode,
		MaxAge:   -1,
	}
}

func (server *Server) passwordVerifiedCookie(token string) *stdhttp.Cookie {
	//nolint:gosec // Secure may be disabled only by explicit local-development configuration.
	cookie := &stdhttp.Cookie{
		Name:     passwordVerifiedCookieName,
		Path:     "/",
		HttpOnly: true,
		Secure:   server.cookie.Secure,
		SameSite: stdhttp.SameSiteLaxMode,
	}

	if token == "" {
		cookie.MaxAge = -1
		return cookie
	}

	mac := hmac.New(sha256.New, []byte(server.oidcStateSecret))
	_, _ = mac.Write([]byte(token))
	cookie.Value = base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	cookie.MaxAge = oidcAttemptMaxAgeSeconds
	return cookie
}

func (server *Server) hasPasswordVerified(request *stdhttp.Request) bool {
	if server.oidcStateSecret == "" {
		return false
	}
	cookie, err := request.Cookie(passwordVerifiedCookieName)
	if err != nil {
		return false
	}

	expected := server.passwordVerifiedCookie(server.cookieToken(request.Header)).Value
	return hmac.Equal([]byte(cookie.Value), []byte(expected))
}
