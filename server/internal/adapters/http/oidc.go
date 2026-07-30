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
	"net/url"
	"strings"
	"time"

	stdhttp "net/http"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type OIDCConfig struct {
	StateSecret string
	SuccessURL  string
}

type oidcClient interface {
	Enabled() bool
	AuthorizationURL(string, string, string) string
	Exchange(context.Context, string, string, string) (domain.ExternalIdentity, error)
}

type oidcSessionService interface {
	LoginExternal(context.Context, domain.ExternalIdentity) (domain.Session, error)
	LinkExternalIdentity(context.Context, string, domain.ExternalIdentity) error
	AcceptExternalInvitation(context.Context, string, domain.ExternalIdentity, domain.Locale) (domain.Session, error)
}

type oidcAttempt struct {
	State           string `json:"state"`
	Nonce           string `json:"nonce"`
	Verifier        string `json:"verifier"`
	Mode            string `json:"mode"`
	InvitationToken string `json:"invitation_token,omitempty"`
	ExpiresAt       int64  `json:"expires_at"`
}

func (server *Server) googleOIDCStart(client oidcClient, config OIDCConfig) stdhttp.HandlerFunc {
	return func(response stdhttp.ResponseWriter, request *stdhttp.Request) {
		if _, ok := server.sessions.(oidcSessionService); !ok || len(config.StateSecret) < 32 {
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
		value, err := sealOIDCAttempt(config.StateSecret, &attempt)
		if err != nil {
			server.oidcFailure(response, request, config)
			return
		}
		stdhttp.SetCookie(response, &stdhttp.Cookie{Name: "clinks_oidc", Value: value, Path: "/", HttpOnly: true, Secure: server.cookie.Secure, SameSite: stdhttp.SameSiteLaxMode, MaxAge: 600}) // #nosec G124 -- plaintext cookies require explicit local-development configuration.
		stdhttp.Redirect(response, request, client.AuthorizationURL(attempt.State, attempt.Nonce, attempt.Verifier), stdhttp.StatusFound)
	}
}

func (server *Server) googleOIDCCallback(client oidcClient, config OIDCConfig) stdhttp.HandlerFunc {
	return func(response stdhttp.ResponseWriter, request *stdhttp.Request) {
		cookie, err := request.Cookie("clinks_oidc")
		if err != nil || request.URL.Query().Get("error") != "" {
			server.oidcFailure(response, request, config)
			return
		}
		attempt, err := openOIDCAttempt(config.StateSecret, cookie.Value)
		if err != nil || attempt.State != request.URL.Query().Get("state") {
			server.oidcFailure(response, request, config)
			return
		}
		identity, err := client.Exchange(request.Context(), request.URL.Query().Get("code"), attempt.Verifier, attempt.Nonce)
		auth, ok := server.sessions.(oidcSessionService)
		if err != nil || !ok || !server.authLimiter.allow("oidc:"+string(identity.Issuer)+":"+string(identity.Subject)) {
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
		stdhttp.SetCookie(response, &stdhttp.Cookie{Name: "clinks_oidc", Value: "", Path: "/", HttpOnly: true, Secure: server.cookie.Secure, MaxAge: -1}) // #nosec G124 -- plaintext cookies require explicit local-development configuration.
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
	return oidcAttempt{State: state, Nonce: nonce, Verifier: verifier, Mode: mode, ExpiresAt: time.Now().Add(10 * time.Minute).Unix()}, nil
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
	block, err := aes.NewCipher([]byte(secret[:32]))
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
	return base64.RawURLEncoding.EncodeToString(append(nonce, gcm.Seal(nil, nonce, payload, nil)...)), nil
}

func openOIDCAttempt(secret, value string) (oidcAttempt, error) {
	if len(secret) < 32 {
		return oidcAttempt{}, stdhttp.ErrNoCookie
	}
	encoded, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return oidcAttempt{}, err
	}
	block, err := aes.NewCipher([]byte(secret[:32]))
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
	payload, err := gcm.Open(nil, encoded[:gcm.NonceSize()], encoded[gcm.NonceSize():], nil)
	if err != nil {
		return oidcAttempt{}, err
	}
	var attempt oidcAttempt
	err = json.Unmarshal(payload, &attempt)
	if err == nil && (attempt.ExpiresAt < time.Now().Unix() || attempt.State == "" || attempt.Nonce == "" || attempt.Verifier == "") {
		return oidcAttempt{}, stdhttp.ErrNoCookie
	}
	return attempt, err
}

func (server *Server) passwordVerifiedCookie(token string) *stdhttp.Cookie {
	cookie := &stdhttp.Cookie{Name: "clinks_password_verified", Path: "/", HttpOnly: true, Secure: server.cookie.Secure, SameSite: stdhttp.SameSiteLaxMode} // #nosec G124 -- plaintext cookies require explicit local-development configuration.
	if token == "" {
		cookie.MaxAge = -1
		return cookie
	}
	mac := hmac.New(sha256.New, []byte(server.oidcStateSecret))
	_, _ = mac.Write([]byte(token))
	cookie.Value = base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	cookie.MaxAge = 600
	return cookie
}

func (server *Server) hasPasswordVerified(request *stdhttp.Request) bool {
	if server.oidcStateSecret == "" {
		return false
	}
	cookie, err := request.Cookie("clinks_password_verified")
	if err != nil {
		return false
	}
	expected := server.passwordVerifiedCookie(server.cookieToken(request.Header)).Value
	return hmac.Equal([]byte(cookie.Value), []byte(expected))
}
