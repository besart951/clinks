package main

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	authadapter "github.com/besartmorina/clinks/server/internal/adapters/auth"
	httpadapter "github.com/besartmorina/clinks/server/internal/adapters/http"
	"github.com/besartmorina/clinks/server/internal/adapters/i18n"
	"github.com/besartmorina/clinks/server/internal/adapters/postgres"
	appconfig "github.com/besartmorina/clinks/server/internal/config"
	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
	"github.com/besartmorina/clinks/server/internal/core/service"
)

const (
	defaultReadinessTimeout   = 2 * time.Second
	defaultHealthcheckTimeout = 5 * time.Second
)

type Application struct {
	api        *httpadapter.Server
	oidc       *authadapter.GoogleOIDC
	oidcConfig httpadapter.OIDCConfig
	logger     *slog.Logger
}

func NewApplication(
	api *httpadapter.Server,
	oidc *authadapter.GoogleOIDC,
	oidcConfig httpadapter.OIDCConfig,
	logger *slog.Logger,
) *Application {
	return &Application{
		api:        api,
		oidc:       oidc,
		oidcConfig: oidcConfig,
		logger:     logger,
	}
}

func (app *Application) Run(
	ctx context.Context,
	config appconfig.HTTPConfig,
) error {
	handler, err := app.api.HandlerWithOIDC(
		app.oidc,
		app.oidcConfig,
	)
	if err != nil {
		return fmt.Errorf("build HTTP handler: %w", err)
	}

	return NewHTTPServer(config, handler, app.logger).Run(ctx)
}

func poolConfig(
	settings *appconfig.Config,
) postgres.PoolConfig {
	return postgres.PoolConfig{
		DatabaseURL:       settings.Database.URL,
		MaxConns:          settings.Database.MaxConns,
		MinConns:          settings.Database.MinConns,
		MaxConnLifetime:   settings.Database.ConnMaxLifetime,
		MaxConnIdleTime:   settings.Database.ConnMaxIdleTime,
		HealthCheckPeriod: settings.Database.HealthCheck,
	}
}

func httpServerConfig(
	settings *appconfig.Config,
	defaultLocale domain.Locale,
) httpadapter.ServerConfig {
	return httpadapter.ServerConfig{
		CORSOrigins:      settings.HTTP.CORSOrigins,
		ReadinessTimeout: defaultReadinessTimeout,
		DefaultLocale:    defaultLocale,
		Cookie: httpadapter.CookieConfig{
			Name:   settings.HTTP.SessionCookieName,
			Secure: settings.HTTP.SessionCookieSecure,
			Domain: settings.HTTP.SessionCookieDomain,
			MaxAge: settings.Auth.JWTTTL,
		},
	}
}

func inviteBaseURL(settings *appconfig.Config) string {
	return settings.Invites.PublicBaseURL
}

func inviteTTL(settings *appconfig.Config) time.Duration {
	return settings.Invites.TTL
}

func invitationTokenConfig(
	settings *appconfig.Config,
) authadapter.InvitationTokenConfig {
	return authadapter.InvitationTokenConfig{
		Secret: settings.Invites.TokenSecret,
	}
}

func googleOIDCConfig(
	settings *appconfig.Config,
) authadapter.GoogleOIDCConfig {
	return authadapter.GoogleOIDCConfig{
		ClientID:     settings.OIDC.GoogleClientID,
		ClientSecret: settings.OIDC.GoogleClientSecret,
		CallbackURL:  settings.OIDC.GoogleCallbackURL,
	}
}

func httpOIDCConfig(
	settings *appconfig.Config,
) httpadapter.OIDCConfig {
	return httpadapter.OIDCConfig{
		StateSecret: settings.OIDC.StateSecret,
		SuccessURL:  settings.OIDC.SuccessURL,
	}
}

func sessionConfig(
	settings *appconfig.Config,
) authadapter.SessionConfig {
	return authadapter.SessionConfig{
		Secret:   []byte(settings.Auth.JWTSecret),
		Issuer:   settings.Auth.JWTIssuer,
		Audience: settings.Auth.JWTAudience,
		TTL:      settings.Auth.JWTTTL,
	}
}

func newAuthServices(
	identities ports.SessionIdentityRepository,
	federation ports.ExternalIdentityRepository,
	provisioner ports.TenantProvisioner,
	memberships ports.MembershipSessionReader,
	roles ports.RoleLookup,
	invitations ports.InvitationRepository,
	passwords ports.PasswordHasher,
	sessions ports.SessionIssuer,
	audit ports.AuditAppender,
	invitationIDs ports.InvitationIDGenerator,
	tokens ports.InvitationTokenSigner,
	inviteBaseURL string,
	inviteTTL time.Duration,
) (service.AuthServices, error) {
	return service.NewAuthServices(
		service.AuthDependencies{
			Identities:    identities,
			Federation:    federation,
			Provisioner:   provisioner,
			Memberships:   memberships,
			Roles:         roles,
			Invitations:   invitations,
			Passwords:     passwords,
			Sessions:      sessions,
			Audit:         audit,
			InvitationIDs: invitationIDs,
			Tokens:        tokens,
			InviteBaseURL: inviteBaseURL,
			InviteTTL:     inviteTTL,
		},
	)
}

func newHTTPAdapter(
	credentials *service.CredentialService,
	sessions *service.SessionService,
	invitations *service.InvitationService,
	externalIdentities *service.ExternalIdentityService,
	tenants *service.TenantAdministration,
	localizationEdit *service.LocalizationAdministration,
	audit *service.AuditAdministration,
	users *service.UserAdministration,
	inviteAdmin *service.InvitationAdministration,
	overview *service.SystemOverview,
	tenantManagement *service.TenantManagement,
	localization *service.I18nService,
	translator *i18n.Translator,
	readiness ports.ReadinessChecker,
	config httpadapter.ServerConfig,
) (*httpadapter.Server, error) {
	return httpadapter.NewServer(
		httpadapter.ServerDeps{
			Sessions:         sessions,
			Credentials:      credentials,
			OIDCSessions:     externalIdentities,
			Registration:     credentials,
			Invitations:      invitations,
			Tenants:          tenants,
			LocalizationEdit: localizationEdit,
			Audit:            audit,
			Localization:     localization,
			Translator:       translator,
			Readiness:        readiness,
			Users:            users,
			InviteAdmin:      inviteAdmin,
			Overview:         overview,
			TenantManagement: tenantManagement,
			Logger:           slog.Default(),
		},
		config,
	)
}
