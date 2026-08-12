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
	"errors"
	"fmt"
	stdhttp "net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const (
	oidcCookieName             = "clinks_oidc"
	passwordVerifiedCookieName = "clinks_password_verified"
	oidcAttemptTTL             = 10 * time.Minute
	passwordVerificationTTL    = 10 * time.Minute
)

var errInvalidOIDCAttempt = errors.New("invalid OIDC attempt")

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

func validateOIDCConfig(config OIDCConfig) error {
	if len(config.StateSecret) < 32 {
		return errors.New("http: OIDC state secret must contain at least 32 bytes")
	}

	target, err := url.Parse(config.SuccessURL)
	if err != nil {
		return fmt.Errorf("http: invalid OIDC success URL: %w", err)
	}
	if target.Scheme != "http" && target.Scheme != "https" {
		return fmt.Errorf("http: OIDC success URL uses unsupported scheme %q", target.Scheme)
	}
	if target.Host == "" {
		return errors.New("http: OIDC success URL requires a host")
	}

	return nil
}

func (server *Server) googleOIDCStart(client oidcClient, config OIDCConfig) stdhttp.HandlerFunc {
	return func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		mode := r.URL.Query().Get("mode")
		switch mode {
		case "link":
			token := server.cookieToken(r.Header)
			if token == "" {
				server.oidcFailure(w, r, config)
				return
			}
			if _, err := server.sessions.CurrentSession(r.Context(), token); err != nil {
				server.oidcFailure(w, r, config)
				return
			}
			if !server.hasPasswordVerified(r) {
				server.oidcFailure(w, r, config)
				return
			}

		case "invite":
			if strings.TrimSpace(r.URL.Query().Get("token")) == "" {
				server.oidcFailure(w, r, config)
				return
			}

		case "", "login":
			mode = "login"

		default:
			server.oidcFailure(w, r, config)
			return
		}

		attempt, err := newOIDCAttempt(mode)
		if err != nil {
			server.logger.Error("create OIDC attempt", "err", err)
			server.oidcFailure(w, r, config)
			return
		}
		if mode == "invite" {
			attempt.InvitationToken = r.URL.Query().Get("token")
		}

		sealedValue, err := sealOIDCAttempt(config.StateSecret, attempt)
		if err != nil {
			server.logger.Error("seal OIDC attempt", "err", err)
			server.oidcFailure(w, r, config)
			return
		}

		stdhttp.SetCookie(w, server.oidcAttemptCookie(sealedValue))
		stdhttp.Redirect(
			w,
			r,
			client.AuthorizationURL(attempt.State, attempt.Nonce, attempt.Verifier),
			stdhttp.StatusFound,
		)
	}
}

func (server *Server) googleOIDCCallback(client oidcClient, config OIDCConfig) stdhttp.HandlerFunc {
	return func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		cookie, err := r.Cookie(oidcCookieName)
		if err != nil {
			server.oidcFailure(w, r, config)
			return
		}
		stdhttp.SetCookie(w, server.clearOIDCAttemptCookie())

		if r.URL.Query().Get("error") != "" {
			server.oidcFailure(w, r, config)
			return
		}

		attempt, err := openOIDCAttempt(config.StateSecret, cookie.Value)
		if err != nil || !constantTimeEqual(attempt.State, r.URL.Query().Get("state")) {
			server.oidcFailure(w, r, config)
			return
		}

		code := strings.TrimSpace(r.URL.Query().Get("code"))
		if code == "" {
			server.oidcFailure(w, r, config)
			return
		}

		auth := server.oidcSessions

		identity, err := client.Exchange(r.Context(), code, attempt.Verifier, attempt.Nonce)
		if err != nil {
			server.logger.Warn("OIDC exchange failed", "err", err)
			server.oidcFailure(w, r, config)
			return
		}

		switch attempt.Mode {
		case "link":
			err = auth.LinkExternalIdentity(
				r.Context(),
				server.cookieToken(r.Header),
				identity,
			)
			if err == nil {
				stdhttp.SetCookie(w, server.passwordVerifiedCookie(""))
			}

		case "invite":
			var session domain.Session
			session, err = auth.AcceptExternalInvitation(
				r.Context(),
				attempt.InvitationToken,
				identity,
				server.requestLocale(r.Header),
			)
			if err == nil {
				stdhttp.SetCookie(w, server.sessionCookie(session.Token))
			}

		case "login":
			var session domain.Session
			session, err = auth.LoginExternal(r.Context(), identity)
			if err == nil {
				stdhttp.SetCookie(w, server.sessionCookie(session.Token))
			}

		default:
			err = errInvalidOIDCAttempt
		}

		if err != nil {
			server.logger.Warn("OIDC authentication failed", "mode", attempt.Mode, "err", err)
			server.oidcFailure(w, r, config)
			return
		}

		stdhttp.Redirect(w, r, config.SuccessURL, stdhttp.StatusFound)
	}
}

func (server *Server) oidcFailure(w stdhttp.ResponseWriter, r *stdhttp.Request, config OIDCConfig) {
	target, err := url.Parse(config.SuccessURL)
	if err != nil || target.Scheme == "" || target.Host == "" {
		stdhttp.Error(w, "authentication failed", stdhttp.StatusUnauthorized)
		return
	}

	query := target.Query()
	query.Set("error", "authentication_failed")
	target.RawQuery = query.Encode()

	stdhttp.Redirect(w, r, target.String(), stdhttp.StatusFound)
}

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
		ExpiresAt: time.Now().Add(oidcAttemptTTL).Unix(),
	}, nil
}

func randomOIDCValue(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("read OIDC randomness: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func sealOIDCAttempt(secret string, attempt oidcAttempt) (string, error) {
	if len(secret) < 32 {
		return "", errInvalidOIDCAttempt
	}

	key := oidcAttemptEncryptionKey(secret)
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("read OIDC sealing nonce: %w", err)
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
		return oidcAttempt{}, errInvalidOIDCAttempt
	}

	encoded, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return oidcAttempt{}, err
	}

	key := oidcAttemptEncryptionKey(secret)
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return oidcAttempt{}, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return oidcAttempt{}, err
	}
	if len(encoded) < gcm.NonceSize() {
		return oidcAttempt{}, errInvalidOIDCAttempt
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

	if !validOIDCAttempt(attempt, time.Now()) {
		return oidcAttempt{}, errInvalidOIDCAttempt
	}

	return attempt, nil
}

func validOIDCAttempt(attempt oidcAttempt, now time.Time) bool {
	if attempt.State == "" || attempt.Nonce == "" || attempt.Verifier == "" {
		return false
	}
	if attempt.ExpiresAt <= now.Unix() {
		return false
	}

	switch attempt.Mode {
	case "login", "link":
		return attempt.InvitationToken == ""
	case "invite":
		return strings.TrimSpace(attempt.InvitationToken) != ""
	default:
		return false
	}
}

func oidcAttemptEncryptionKey(secret string) [sha256.Size]byte {
	return sha256.Sum256([]byte("clinks:oidc-attempt:v1\x00" + secret))
}

func constantTimeEqual(left, right string) bool {
	return hmac.Equal([]byte(left), []byte(right))
}

func (server *Server) oidcAttemptCookie(value string) *stdhttp.Cookie {
	//nolint:gosec // Secure may be disabled only by explicit local-development configuration.
	return &stdhttp.Cookie{
		Name:     oidcCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   server.cookie.Secure,
		SameSite: stdhttp.SameSiteLaxMode,
		MaxAge:   int(oidcAttemptTTL.Seconds()),
		Expires:  time.Now().Add(oidcAttemptTTL),
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
		Expires:  time.Unix(1, 0),
	}
}

func (server *Server) passwordVerifiedCookie(sessionToken string) *stdhttp.Cookie {
	//nolint:gosec // Secure may be disabled only by explicit local-development configuration.
	cookie := &stdhttp.Cookie{
		Name:     passwordVerifiedCookieName,
		Path:     "/",
		HttpOnly: true,
		Secure:   server.cookie.Secure,
		SameSite: stdhttp.SameSiteLaxMode,
	}

	if sessionToken == "" {
		cookie.MaxAge = -1
		cookie.Expires = time.Unix(1, 0)
		return cookie
	}

	expiresAt := time.Now().Add(passwordVerificationTTL)
	expiresUnix := strconv.FormatInt(expiresAt.Unix(), 10)
	signature := server.passwordVerificationMAC(sessionToken, expiresUnix)

	cookie.Value = expiresUnix + "." + base64.RawURLEncoding.EncodeToString(signature)
	cookie.MaxAge = int(passwordVerificationTTL.Seconds())
	cookie.Expires = expiresAt
	return cookie
}

func (server *Server) hasPasswordVerified(r *stdhttp.Request) bool {
	if len(server.oidcStateSecret) < 32 {
		return false
	}

	cookie, err := r.Cookie(passwordVerifiedCookieName)
	if err != nil {
		return false
	}

	expiresUnix, encodedSignature, ok := strings.Cut(cookie.Value, ".")
	if !ok {
		return false
	}

	expiresAt, err := strconv.ParseInt(expiresUnix, 10, 64)
	if err != nil || time.Now().Unix() >= expiresAt {
		return false
	}

	signature, err := base64.RawURLEncoding.DecodeString(encodedSignature)
	if err != nil {
		return false
	}

	sessionToken := server.cookieToken(r.Header)
	if sessionToken == "" {
		return false
	}

	expected := server.passwordVerificationMAC(sessionToken, expiresUnix)
	return hmac.Equal(signature, expected)
}

func (server *Server) passwordVerificationMAC(sessionToken, expiresUnix string) []byte {
	key := sha256.Sum256([]byte("clinks:password-verification:v1\x00" + server.oidcStateSecret))
	mac := hmac.New(sha256.New, key[:])
	_, _ = mac.Write([]byte(sessionToken))
	_, _ = mac.Write([]byte{0})
	_, _ = mac.Write([]byte(expiresUnix))
	return mac.Sum(nil)
}
