// Package http exposes Connect-RPC and the two plain HTTP health probes.
package http

import (
	"context"
	"errors"
	"log/slog"
	stdhttp "net/http"
	"strings"
	"time"

	"connectrpc.com/connect"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
	"github.com/besartmorina/clinks/server/proto/clinks/v1/clinksv1connect"
)

const sessionCookieName = "clinks_session"

type Server struct {
	clinksv1connect.UnimplementedClinksServiceHandler
	sessions         sessionService
	registration     registrationService
	invitations      invitationService
	tenants          tenantAdministration
	localizationEdit localizationAdministration
	audit            auditLog
	localization     localizationService
	translator       errorTranslator
	readiness        ports.ReadinessChecker
	readinessTimeout time.Duration
	browserPolicy    browserPolicy
	cookie           CookieConfig
	oidcStateSecret  string
	authLimiter      *identityRateLimiter
	users            userAdministration
	inviteAdmin      invitationAdministration
	overview         systemOverview
}

type sessionService interface {
	Login(context.Context, string, string) (domain.Session, error)
	LoginSuperAdmin(context.Context, string, string) (domain.Session, error)
	Logout(context.Context, string) error
	CurrentSession(context.Context, string) (domain.Session, error)
	SwitchTenant(context.Context, string, domain.TenantID) (domain.Session, error)
}

type registrationService interface {
	Register(context.Context, string, string, string, domain.Locale) (domain.Session, error)
}

type invitationService interface {
	CreateInvitation(context.Context, string, string, domain.Role) (domain.Invitation, error)
	AcceptInvitation(context.Context, string, string, string, domain.Locale) (domain.Session, error)
}

type tenantAdministration interface {
	CreateTenant(context.Context, string, domain.UserID) (domain.Tenant, error)
	Tenants(context.Context) ([]domain.Tenant, error)
}

type localizationAdministration interface {
	Languages(context.Context) ([]domain.Language, error)
	SaveLanguage(context.Context, domain.Language, domain.UserID) error
	SaveTranslationOverride(context.Context, domain.Translation, domain.UserID) error
}

type auditLog interface {
	AuditEvents(context.Context, *domain.AuditFilter) (domain.AuditPage, error)
}

type userAdministration interface {
	ListUsers(context.Context, domain.UserFilter) (domain.Page[domain.UserSummary], error)
	GetUser(context.Context, domain.UserID) (domain.UserDetail, error)
}

type invitationAdministration interface {
	ListInvitations(context.Context, domain.InvitationFilter) (domain.Page[domain.Invitation], error)
	RevokeInvitation(context.Context, domain.InvitationID) error
}

type systemOverview interface {
	Stats(context.Context) (domain.SystemStats, error)
}

type localizationService interface {
	ActiveLanguages(context.Context) ([]domain.Language, error)
	TranslationBundle(context.Context, domain.Locale, domain.ApplicationScope) (domain.TranslationBundle, error)
}

type errorTranslator interface {
	ErrorMessage(context.Context, domain.Locale, error) string
	AuditDescription(context.Context, domain.Locale, *domain.AuditEvent) string
}

type ServerConfig struct {
	CORSOrigins      []string
	ReadinessTimeout time.Duration
	Cookie           CookieConfig
}

type CookieConfig struct {
	Name   string
	Secure bool
	MaxAge time.Duration
	Domain string
}

type ServerDeps struct {
	Sessions         sessionService
	Registration     registrationService
	Invitations      invitationService
	Tenants          tenantAdministration
	LocalizationEdit localizationAdministration
	Audit            auditLog
	Localization     localizationService
	Translator       errorTranslator
	Readiness        ports.ReadinessChecker
	Users            userAdministration
	InviteAdmin      invitationAdministration
	Overview         systemOverview
}

func NewServer(deps *ServerDeps, config *ServerConfig) *Server {
	if config.Cookie.Name == "" {
		config.Cookie.Name = sessionCookieName
	}
	return &Server{sessions: deps.Sessions, registration: deps.Registration, invitations: deps.Invitations, tenants: deps.Tenants, localizationEdit: deps.LocalizationEdit, audit: deps.Audit, localization: deps.Localization, translator: deps.Translator, readiness: deps.Readiness, readinessTimeout: config.ReadinessTimeout, browserPolicy: newBrowserPolicy(config.CORSOrigins), cookie: config.Cookie, authLimiter: newIdentityRateLimiter(5, 10*time.Minute), users: deps.Users, inviteAdmin: deps.InviteAdmin, overview: deps.Overview}
}

// StartCleanup begins background goroutines owned by the server (e.g., rate
// limiter entry eviction). Callers should pass the process-level context.
func (server *Server) StartCleanup(ctx context.Context) {
	go server.authLimiter.runCleanup(ctx)
}

func (server *Server) Handler() stdhttp.Handler {
	return server.handler(nil, OIDCConfig{})
}

func (server *Server) HandlerWithOIDC(client oidcClient, config OIDCConfig) stdhttp.Handler {
	server.oidcStateSecret = config.StateSecret
	return server.handler(client, config)
}

func (server *Server) handler(client oidcClient, oidcConfig OIDCConfig) stdhttp.Handler {
	router := stdhttp.NewServeMux()
	router.HandleFunc("GET /healthz", server.health)
	router.HandleFunc("GET /readyz", server.ready)
	if client != nil && client.Enabled() {
		router.HandleFunc("GET /auth/oidc/google/start", server.googleOIDCStart(client, oidcConfig))
		router.HandleFunc("GET /auth/oidc/google/callback", server.googleOIDCCallback(client, oidcConfig))
	}
	path, rpcHandler := clinksv1connect.NewClinksServiceHandler(server, connect.WithInterceptors(server.sessionInterceptor()))
	router.Handle(path, rpcHandler)
	return server.browserPolicy.protect(router)
}

func (server *Server) health(response stdhttp.ResponseWriter, _ *stdhttp.Request) {
	response.WriteHeader(stdhttp.StatusOK)
}

func (server *Server) ready(response stdhttp.ResponseWriter, request *stdhttp.Request) {
	ctx, cancel := context.WithTimeout(request.Context(), server.readinessTimeout)
	defer cancel()
	if err := server.readiness.Ready(ctx); err != nil {
		response.WriteHeader(stdhttp.StatusServiceUnavailable)
		return
	}
	response.WriteHeader(stdhttp.StatusOK)
}

func (server *Server) sessionResponse(ctx context.Context, header stdhttp.Header, session *domain.Session, err error) (*connect.Response[clinksv1.Session], error) {
	if err != nil {
		return nil, server.localizedError(ctx, header, err)
	}
	response := connect.NewResponse(sessionMessage(session))
	response.Header().Add("Set-Cookie", server.sessionCookie(session.Token).String())
	return response, nil
}

func (server *Server) localizedError(ctx context.Context, header stdhttp.Header, err error) error {
	code := connectCode(err)
	message := server.translator.ErrorMessage(ctx, requestLocale(header), err)
	if code == connect.CodeInternal {
		slog.Error("RPC request failed", "error", err)
	}
	response := connect.NewError(code, errors.New(message))
	response.Meta().Set("Clinks-Locale", string(requestLocale(header)))
	var domainErr *domain.Error
	if errors.As(err, &domainErr) {
		response.Meta().Set("Clinks-Error-Kind", string(domainErr.Kind))
	} else {
		response.Meta().Set("Clinks-Error-Kind", string(domain.ErrorInternal))
	}
	return response
}

func (server *Server) cookieToken(header stdhttp.Header) string {
	request := stdhttp.Request{Header: header}
	cookie, err := request.Cookie(server.cookie.Name)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func (server *Server) sessionCookie(token string) *stdhttp.Cookie {
	cookie := &stdhttp.Cookie{Name: server.cookie.Name, Value: token, Path: "/", Domain: server.cookie.Domain, HttpOnly: true, Secure: server.cookie.Secure, SameSite: stdhttp.SameSiteLaxMode} // #nosec G124 -- plaintext cookies require explicit local-development configuration.
	if token == "" {
		cookie.MaxAge = -1
		cookie.Expires = time.Unix(1, 0)
		return cookie
	}
	cookie.MaxAge = int(server.cookie.MaxAge.Seconds())
	return cookie
}

func requestLocale(header stdhttp.Header) domain.Locale {
	value := strings.Split(header.Get("Accept-Language"), ",")[0]
	value = strings.TrimSpace(strings.Split(value, ";")[0])
	if value == "" {
		return "en-US"
	}
	return domain.NewLocale(value)
}

func connectCode(err error) connect.Code {
	var domainError *domain.Error
	if !errors.As(err, &domainError) {
		return connect.CodeInternal
	}
	switch domainError.Kind {
	case domain.ErrorInvalidCredentials:
		return connect.CodeUnauthenticated
	case domain.ErrorUnauthorized, domain.ErrorMembershipNotFound:
		return connect.CodePermissionDenied
	case domain.ErrorValidation, domain.ErrorInviteEmailMismatch:
		return connect.CodeInvalidArgument
	case domain.ErrorEmailTaken:
		return connect.CodeAlreadyExists
	case domain.ErrorTenantNotFound, domain.ErrorInvitationInvalid:
		return connect.CodeNotFound
	case domain.ErrorInvitationExpired, domain.ErrorInvitationUsed:
		return connect.CodeFailedPrecondition
	default:
		return connect.CodeInternal
	}
}

var _ clinksv1connect.ClinksServiceHandler = (*Server)(nil)
