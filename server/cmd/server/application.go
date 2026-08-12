package main

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	authadapter "github.com/besartmorina/clinks/server/internal/adapters/auth"
	httpadapter "github.com/besartmorina/clinks/server/internal/adapters/http"
	"github.com/besartmorina/clinks/server/internal/adapters/i18n"
	mailadapter "github.com/besartmorina/clinks/server/internal/adapters/mail"
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
	pool       *pgxpool.Pool
	auth       *service.AuthService
	oidc       *authadapter.GoogleOIDC
	oidcConfig httpadapter.OIDCConfig
}

func NewApplication(
	api *httpadapter.Server,
	pool *pgxpool.Pool,
	auth *service.AuthService,
	oidc *authadapter.GoogleOIDC,
	oidcConfig httpadapter.OIDCConfig,
) *Application {
	return &Application{
		api:        api,
		pool:       pool,
		auth:       auth,
		oidc:       oidc,
		oidcConfig: oidcConfig,
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

	return NewHTTPServer(config, handler).Run(ctx)
}

func (app *Application) MigrateAndBootstrap(
	ctx context.Context,
	bootstrap appconfig.BootstrapConfig,
) error {
	if err := postgres.Migrate(ctx, app.pool); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}

	if err := app.auth.EnsureSuperAdmin(
		ctx,
		bootstrap.Email,
		bootstrap.Password,
		domain.NewLocale(bootstrap.Locale),
	); err != nil {
		return fmt.Errorf("bootstrap administrator: %w", err)
	}

	return nil
}

func (app *Application) Healthcheck(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(
		ctx,
		defaultHealthcheckTimeout,
	)
	defer cancel()

	if err := app.pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	return nil
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
) httpadapter.ServerConfig {
	return httpadapter.ServerConfig{
		CORSOrigins:      settings.HTTP.CORSOrigins,
		ReadinessTimeout: defaultReadinessTimeout,
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

func smtpConfig(
	settings *appconfig.Config,
) *mailadapter.SMTPConfig {
	return &mailadapter.SMTPConfig{
		Host:       settings.SMTP.Host,
		Port:       settings.SMTP.Port,
		Username:   settings.SMTP.Username,
		Password:   settings.SMTP.Password,
		From:       settings.SMTP.From,
		RequireTLS: settings.SMTP.RequireTLS,
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

func newAuthService(
	identities ports.IdentityRepository,
	federation ports.ExternalIdentityRepository,
	provisioner ports.TenantProvisioner,
	memberships ports.MembershipRepository,
	passwords ports.PasswordHasher,
	sessions ports.SessionIssuer,
	audit ports.AuditLog,
	tokens ports.InvitationTokenSigner,
	inviteBaseURL string,
	inviteTTL time.Duration,
) *service.AuthService {
	return service.NewAuthService(
		&service.AuthDependencies{
			Identities:    identities,
			Federation:    federation,
			Provisioner:   provisioner,
			Memberships:   memberships,
			Passwords:     passwords,
			Sessions:      sessions,
			Audit:         audit,
			Tokens:        tokens,
			InviteBaseURL: inviteBaseURL,
			InviteTTL:     inviteTTL,
		},
	)
}

func newHTTPAdapter(
	auth *service.AuthService,
	admin *service.AdminService,
	localization *service.I18nService,
	translator *i18n.Translator,
	readiness ports.ReadinessChecker,
	config httpadapter.ServerConfig,
) (*httpadapter.Server, error) {
	return httpadapter.NewServer(
		httpadapter.ServerDeps{
			Sessions:         auth,
			Registration:     auth,
			Invitations:      auth,
			Tenants:          admin,
			LocalizationEdit: admin,
			Audit:            admin,
			Localization:     localization,
			Translator:       translator,
			Readiness:        readiness,
			Users:            admin,
			InviteAdmin:      admin,
			Overview:         admin,
		},
		config,
	)
}
