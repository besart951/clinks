// Package http exposes the application's Connect-RPC and plain HTTP endpoints.
package http

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	stdhttp "net/http"
	"time"

	"connectrpc.com/connect"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
	"github.com/besartmorina/clinks/server/proto/clinks/v1/clinksv1connect"
)

const (
	sessionCookieName       = "clinks_session"
	defaultReadinessTimeout = 5 * time.Second
)

type Server struct {
	clinksv1connect.UnimplementedClinksServiceHandler

	sessions         sessionService
	credentials      credentialService
	oidcSessions     oidcSessionService
	registration     registrationService
	invitations      invitationService
	tenants          tenantAdministration
	localizationEdit localizationAdministration
	audit            auditLog
	localization     localizationService
	translator       errorTranslator
	readiness        ports.ReadinessChecker
	users            userAdministration
	inviteAdmin      invitationAdministration
	overview         systemOverview
	tenantManagement tenantManagement

	readinessTimeout time.Duration
	browserPolicy    browserPolicy
	cookie           CookieConfig
	authLimiter      *rateLimiter
	oidcStateSecret  string
	logger           *slog.Logger
	defaultLocale    domain.Locale
}

type sessionService interface {
	Logout(context.Context, string) error
	CurrentSession(context.Context, string) (domain.Session, error)
	SwitchTenant(context.Context, string, domain.TenantID) (domain.Session, error)
}

type credentialService interface {
	Login(context.Context, string, string) (domain.Session, error)
	LoginSuperAdmin(context.Context, string, string) (domain.Session, error)
}

type registrationService interface {
	Register(context.Context, string, string, string, domain.Locale) (domain.Session, error)
}

type invitationService interface {
	CreateInvitation(context.Context, string, string, domain.RoleID) (domain.Invitation, error)
	AcceptInvitation(context.Context, string, string, string, domain.Locale) (domain.Session, error)
}

type tenantAdministration interface {
	CreateTenant(context.Context, string, domain.UserID) (domain.Tenant, error)
	Tenants(context.Context, domain.TenantFilter) (domain.Page[domain.Tenant], error)
	UpdateTenant(context.Context, domain.Tenant, domain.UserID) (domain.Tenant, error)
}

type tenantManagement interface {
	UpdateCurrentTenant(context.Context, domain.Session, string, uint64) (domain.Tenant, error)
	ListMemberships(context.Context, domain.Session, domain.MembershipFilter) (domain.Page[domain.Membership], error)
	UpdateMembership(context.Context, domain.Session, domain.Membership) (domain.Membership, error)
	ListRoles(context.Context, domain.Session, domain.RoleFilter) (domain.Page[domain.Role], error)
	CreateRole(context.Context, domain.Session, string, []domain.Permission) (domain.Role, error)
	UpdateRole(context.Context, domain.Session, domain.Role) (domain.Role, error)
	DeleteRole(context.Context, domain.Session, domain.RoleID, uint64) error
	ListInvitations(context.Context, domain.Session, domain.InvitationFilter) (domain.Page[domain.Invitation], error)
	RevokeInvitation(context.Context, domain.Session, domain.InvitationID) error
}

type localizationAdministration interface {
	Languages(context.Context, domain.LanguageFilter) (domain.Page[domain.Language], error)
	SaveLanguage(context.Context, domain.Language, domain.UserID) (domain.Language, error)
	SaveTranslationOverride(context.Context, domain.Translation, domain.UserID) (domain.Translation, error)
	TranslationOverrides(context.Context, domain.TranslationFilter) (domain.Page[domain.Translation], error)
	DeleteTranslationOverride(context.Context, domain.Translation, domain.UserID) error
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
	RevokeInvitation(context.Context, domain.InvitationID, domain.UserID) error
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
	AuditDescription(context.Context, domain.Locale, domain.AuditEvent) string
}

type ServerConfig struct {
	CORSOrigins      []string
	ReadinessTimeout time.Duration
	Cookie           CookieConfig
	DefaultLocale    domain.Locale
}

type CookieConfig struct {
	Name   string
	Secure bool
	MaxAge time.Duration
	Domain string
}

type ServerDeps struct {
	Sessions         sessionService
	Credentials      credentialService
	OIDCSessions     oidcSessionService
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
	TenantManagement tenantManagement
	Logger           *slog.Logger
}

func NewServer(deps ServerDeps, config ServerConfig) (*Server, error) {
	if err := validateServerDeps(deps); err != nil {
		return nil, err
	}

	browserPolicy, err := newBrowserPolicy(config.CORSOrigins)
	if err != nil {
		return nil, fmt.Errorf("http: browser policy: %w", err)
	}

	if config.Cookie.Name == "" {
		config.Cookie.Name = sessionCookieName
	}
	if config.ReadinessTimeout <= 0 {
		config.ReadinessTimeout = defaultReadinessTimeout
	}
	if !config.DefaultLocale.IsValid() {
		return nil, errors.New("http: default locale is invalid")
	}

	return &Server{
		sessions:         deps.Sessions,
		credentials:      deps.Credentials,
		oidcSessions:     deps.OIDCSessions,
		registration:     deps.Registration,
		invitations:      deps.Invitations,
		tenants:          deps.Tenants,
		localizationEdit: deps.LocalizationEdit,
		audit:            deps.Audit,
		localization:     deps.Localization,
		translator:       deps.Translator,
		readiness:        deps.Readiness,
		users:            deps.Users,
		inviteAdmin:      deps.InviteAdmin,
		overview:         deps.Overview,
		tenantManagement: deps.TenantManagement,
		logger:           deps.Logger,
		defaultLocale:    config.DefaultLocale,
		readinessTimeout: config.ReadinessTimeout,
		browserPolicy:    browserPolicy,
		cookie:           config.Cookie,
		authLimiter:      newRateLimiter(5, 10*time.Minute),
	}, nil
}

func validateServerDeps(deps ServerDeps) error {
	switch {
	case deps.Sessions == nil:
		return errors.New("http: sessions dependency is required")
	case deps.Credentials == nil:
		return errors.New("http: credentials dependency is required")
	case deps.OIDCSessions == nil:
		return errors.New("http: OIDC sessions dependency is required")
	case deps.Registration == nil:
		return errors.New("http: registration dependency is required")
	case deps.Invitations == nil:
		return errors.New("http: invitations dependency is required")
	case deps.Tenants == nil:
		return errors.New("http: tenants dependency is required")
	case deps.LocalizationEdit == nil:
		return errors.New("http: localization administration dependency is required")
	case deps.Audit == nil:
		return errors.New("http: audit dependency is required")
	case deps.Localization == nil:
		return errors.New("http: localization dependency is required")
	case deps.Translator == nil:
		return errors.New("http: translator dependency is required")
	case deps.Readiness == nil:
		return errors.New("http: readiness dependency is required")
	case deps.Users == nil:
		return errors.New("http: users dependency is required")
	case deps.InviteAdmin == nil:
		return errors.New("http: invitation administration dependency is required")
	case deps.Overview == nil:
		return errors.New("http: system overview dependency is required")
	case deps.TenantManagement == nil:
		return errors.New("http: tenant management dependency is required")
	case deps.Logger == nil:
		return errors.New("http: logger dependency is required")
	default:
		return nil
	}
}

func (server *Server) Handler() stdhttp.Handler {
	return server.handler(nil, OIDCConfig{})
}

func (server *Server) HandlerWithOIDC(client oidcClient, config OIDCConfig) (stdhttp.Handler, error) {
	if client == nil || !client.Enabled() {
		return server.Handler(), nil
	}
	if err := validateOIDCConfig(config); err != nil {
		return nil, err
	}
	// Build an immutable configured handler without mutating the base Server.
	configured := *server
	configured.oidcStateSecret = config.StateSecret
	return configured.handler(client, config), nil
}

func (server *Server) handler(client oidcClient, oidcConfig OIDCConfig) stdhttp.Handler {
	router := stdhttp.NewServeMux()
	router.HandleFunc("GET /healthz", server.health)
	router.HandleFunc("GET /readyz", server.ready)

	if client != nil && client.Enabled() {
		router.HandleFunc("GET /auth/oidc/google/start", server.googleOIDCStart(client, oidcConfig))
		router.HandleFunc("GET /auth/oidc/google/callback", server.googleOIDCCallback(client, oidcConfig))
	}

	path, rpcHandler := clinksv1connect.NewClinksServiceHandler(
		server,
		connect.WithInterceptors(server.sessionInterceptor()),
	)
	router.Handle(path, rpcHandler)

	return server.browserPolicy.protect(router)
}

func (server *Server) health(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
	w.WriteHeader(stdhttp.StatusOK)
}

func (server *Server) ready(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), server.readinessTimeout)
	defer cancel()

	if err := server.readiness.Ready(ctx); err != nil {
		w.WriteHeader(stdhttp.StatusServiceUnavailable)
		return
	}

	w.WriteHeader(stdhttp.StatusOK)
}

var _ clinksv1connect.ClinksServiceHandler = (*Server)(nil)
