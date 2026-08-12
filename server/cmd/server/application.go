package main

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	clinks "github.com/besartmorina/clinks/server"
	"github.com/besartmorina/clinks/server/auth"
	appconfig "github.com/besartmorina/clinks/server/config"
	"github.com/besartmorina/clinks/server/postgres"
	"github.com/besartmorina/clinks/server/web"
)

const (
	defaultReadinessTimeout   = 2 * time.Second
	defaultHealthcheckTimeout = 5 * time.Second
)

type application struct {
	api        *web.Server
	oidc       *auth.GoogleOIDC
	oidcConfig web.OIDCConfig
	logger     *slog.Logger
}

func newApplication(
	api *web.Server,
	oidc *auth.GoogleOIDC,
	oidcConfig web.OIDCConfig,
	logger *slog.Logger,
) *application {
	return &application{
		api:        api,
		oidc:       oidc,
		oidcConfig: oidcConfig,
		logger:     logger,
	}
}

func (app *application) run(
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

	return newHTTPServer(config, handler, app.logger).run(ctx)
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
	defaultLocale clinks.Locale,
) web.ServerConfig {
	return web.ServerConfig{
		CORSOrigins:      settings.HTTP.CORSOrigins,
		ReadinessTimeout: defaultReadinessTimeout,
		DefaultLocale:    defaultLocale,
		Cookie: web.CookieConfig{
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
) auth.InvitationTokenConfig {
	return auth.InvitationTokenConfig{
		Secret: settings.Invites.TokenSecret,
	}
}

func googleOIDCConfig(
	settings *appconfig.Config,
) auth.GoogleOIDCConfig {
	return auth.GoogleOIDCConfig{
		ClientID:     settings.OIDC.GoogleClientID,
		ClientSecret: settings.OIDC.GoogleClientSecret,
		CallbackURL:  settings.OIDC.GoogleCallbackURL,
	}
}

func httpOIDCConfig(
	settings *appconfig.Config,
) web.OIDCConfig {
	return web.OIDCConfig{
		StateSecret: settings.OIDC.StateSecret,
		SuccessURL:  settings.OIDC.SuccessURL,
	}
}

func sessionConfig(
	settings *appconfig.Config,
) auth.SessionConfig {
	return auth.SessionConfig{
		Secret:   []byte(settings.Auth.JWTSecret),
		Issuer:   settings.Auth.JWTIssuer,
		Audience: settings.Auth.JWTAudience,
		TTL:      settings.Auth.JWTTTL,
	}
}
