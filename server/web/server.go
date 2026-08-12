// Package web exposes the application's Connect-RPC and plain HTTP endpoints.
package web

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	stdhttp "net/http"
	"time"

	"connectrpc.com/connect"

	clinks "github.com/besartmorina/clinks/server"
	"github.com/besartmorina/clinks/server/proto/clinks/v1/clinksv1connect"
)

const (
	sessionCookieName       = "clinks_session"
	defaultReadinessTimeout = 5 * time.Second
)

type Server struct {
	clinksv1connect.UnimplementedClinksServiceHandler

	auth         authEndpoints
	admin        adminEndpoints
	localization localizationEndpoints
	tenantAccess tenantManagement

	readiness        readinessChecker
	readinessTimeout time.Duration
	browserPolicy    browserPolicy
	cookie           CookieConfig
	logger           *slog.Logger
	defaultLocale    clinks.Locale
}

type authEndpoints struct {
	sessions     sessionService
	credentials  credentialService
	oidcSessions oidcSessionService
	registration registrationService
	invitations  invitationService
	limiter      *rateLimiter
	oidcSecret   string
}

type adminEndpoints struct {
	tenants          tenantAdministration
	localizationEdit localizationAdministration
	audit            auditLog
	users            userAdministration
	inviteAdmin      invitationAdministration
	overview         systemOverview
}

type localizationEndpoints struct {
	catalog    localizationService
	translator errorTranslator
}

type sessionService interface {
	Logout(context.Context, clinks.Session) error
	CurrentSession(context.Context, string) (clinks.Session, error)
	SwitchTenant(context.Context, clinks.Session, clinks.TenantID) (clinks.Session, error)
}

type credentialService interface {
	Login(context.Context, string, string) (clinks.Session, error)
	LoginSuperAdmin(context.Context, string, string) (clinks.Session, error)
}

type registrationService interface {
	Register(context.Context, string, string, string, clinks.Locale) (clinks.Session, error)
}

type invitationService interface {
	CreateInvitation(context.Context, clinks.Session, string, clinks.RoleID) (clinks.Invitation, error)
	AcceptInvitation(context.Context, string, string, string, clinks.Locale) (clinks.Session, error)
}

type tenantAdministration interface {
	CreateTenant(context.Context, string, clinks.UserID) (clinks.Tenant, error)
	Tenants(context.Context, clinks.TenantFilter) (clinks.Page[clinks.Tenant], error)
	UpdateTenant(context.Context, clinks.Tenant, clinks.UserID) (clinks.Tenant, error)
}

type tenantManagement interface {
	UpdateCurrentTenant(context.Context, clinks.Session, string, uint64) (clinks.Tenant, error)
	ListMemberships(context.Context, clinks.Session, clinks.MembershipFilter) (clinks.Page[clinks.Membership], error)
	UpdateMembership(context.Context, clinks.Session, clinks.Membership) (clinks.Membership, error)
	ListRoles(context.Context, clinks.Session, clinks.RoleFilter) (clinks.Page[clinks.Role], error)
	CreateRole(context.Context, clinks.Session, string, []clinks.Permission) (clinks.Role, error)
	UpdateRole(context.Context, clinks.Session, clinks.Role) (clinks.Role, error)
	DeleteRole(context.Context, clinks.Session, clinks.RoleID, uint64) error
	ListInvitations(context.Context, clinks.Session, clinks.InvitationFilter) (clinks.Page[clinks.Invitation], error)
	RevokeInvitation(context.Context, clinks.Session, clinks.InvitationID) error
}

type localizationAdministration interface {
	Languages(context.Context, clinks.LanguageFilter) (clinks.Page[clinks.Language], error)
	SaveLanguage(context.Context, clinks.Language, clinks.UserID) (clinks.Language, error)
	SaveTranslationOverride(context.Context, clinks.Translation, clinks.UserID) (clinks.Translation, error)
	TranslationOverrides(context.Context, clinks.TranslationFilter) (clinks.Page[clinks.Translation], error)
	DeleteTranslationOverride(context.Context, clinks.Translation, clinks.UserID) error
}

type auditLog interface {
	AuditEvents(context.Context, *clinks.AuditFilter) (clinks.AuditPage, error)
}

type userAdministration interface {
	ListUsers(context.Context, clinks.UserFilter) (clinks.Page[clinks.UserSummary], error)
	GetUser(context.Context, clinks.UserID) (clinks.UserDetail, error)
}

type invitationAdministration interface {
	ListInvitations(context.Context, clinks.InvitationFilter) (clinks.Page[clinks.Invitation], error)
	RevokeInvitation(context.Context, clinks.InvitationID, clinks.UserID) error
}

type systemOverview interface {
	Stats(context.Context) (clinks.SystemStats, error)
}

type readinessChecker interface {
	Ready(context.Context) error
}

type localizationService interface {
	ActiveLanguages(context.Context) ([]clinks.Language, error)
	TranslationBundle(context.Context, clinks.Locale, clinks.ApplicationScope) (clinks.TranslationBundle, error)
}

type errorTranslator interface {
	ErrorMessage(context.Context, clinks.Locale, error) string
	AuditDescription(context.Context, clinks.Locale, clinks.AuditEvent) string
}

type ServerConfig struct {
	CORSOrigins      []string
	ReadinessTimeout time.Duration
	Cookie           CookieConfig
	DefaultLocale    clinks.Locale
}

type CookieConfig struct {
	Name   string
	Secure bool
	MaxAge time.Duration
	Domain string
}

type ServerDeps struct {
	Auth         AuthDeps
	Admin        AdminDeps
	Localization LocalizationDeps
	TenantAccess tenantManagement
	Readiness    readinessChecker
	Logger       *slog.Logger
}

type AuthDeps struct {
	Sessions     sessionService
	Credentials  credentialService
	OIDCSessions oidcSessionService
	Registration registrationService
	Invitations  invitationService
}

type AdminDeps struct {
	Tenants          tenantAdministration
	LocalizationEdit localizationAdministration
	Audit            auditLog
	Users            userAdministration
	InviteAdmin      invitationAdministration
	Overview         systemOverview
}

type LocalizationDeps struct {
	Catalog    localizationService
	Translator errorTranslator
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
		auth: authEndpoints{
			sessions:     deps.Auth.Sessions,
			credentials:  deps.Auth.Credentials,
			oidcSessions: deps.Auth.OIDCSessions,
			registration: deps.Auth.Registration,
			invitations:  deps.Auth.Invitations,
			limiter:      newRateLimiter(5, 10*time.Minute),
		},
		admin: adminEndpoints{
			tenants:          deps.Admin.Tenants,
			localizationEdit: deps.Admin.LocalizationEdit,
			audit:            deps.Admin.Audit,
			users:            deps.Admin.Users,
			inviteAdmin:      deps.Admin.InviteAdmin,
			overview:         deps.Admin.Overview,
		},
		localization: localizationEndpoints{
			catalog:    deps.Localization.Catalog,
			translator: deps.Localization.Translator,
		},
		tenantAccess:     deps.TenantAccess,
		readiness:        deps.Readiness,
		logger:           deps.Logger,
		defaultLocale:    config.DefaultLocale,
		readinessTimeout: config.ReadinessTimeout,
		browserPolicy:    browserPolicy,
		cookie:           config.Cookie,
	}, nil
}

func validateServerDeps(deps ServerDeps) error {
	switch {
	case deps.Auth.Sessions == nil:
		return errors.New("http: sessions dependency is required")
	case deps.Auth.Credentials == nil:
		return errors.New("http: credentials dependency is required")
	case deps.Auth.OIDCSessions == nil:
		return errors.New("http: OIDC sessions dependency is required")
	case deps.Auth.Registration == nil:
		return errors.New("http: registration dependency is required")
	case deps.Auth.Invitations == nil:
		return errors.New("http: invitations dependency is required")
	case deps.Admin.Tenants == nil:
		return errors.New("http: tenants dependency is required")
	case deps.Admin.LocalizationEdit == nil:
		return errors.New("http: localization administration dependency is required")
	case deps.Admin.Audit == nil:
		return errors.New("http: audit dependency is required")
	case deps.Localization.Catalog == nil:
		return errors.New("http: localization dependency is required")
	case deps.Localization.Translator == nil:
		return errors.New("http: translator dependency is required")
	case deps.Readiness == nil:
		return errors.New("http: readiness dependency is required")
	case deps.Admin.Users == nil:
		return errors.New("http: users dependency is required")
	case deps.Admin.InviteAdmin == nil:
		return errors.New("http: invitation administration dependency is required")
	case deps.Admin.Overview == nil:
		return errors.New("http: system overview dependency is required")
	case deps.TenantAccess == nil:
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
	configured.auth.oidcSecret = config.StateSecret
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
