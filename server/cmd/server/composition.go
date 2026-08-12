package main

import (
	"context"
	"fmt"
	"log/slog"

	authadapter "github.com/besartmorina/clinks/server/internal/adapters/auth"
	"github.com/besartmorina/clinks/server/internal/adapters/i18n"
	"github.com/besartmorina/clinks/server/internal/adapters/localization"
	"github.com/besartmorina/clinks/server/internal/adapters/postgres"
	"github.com/besartmorina/clinks/server/internal/adapters/security"
	appconfig "github.com/besartmorina/clinks/server/internal/config"
	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/service"
)

func runServer(ctx context.Context, config *appconfig.Config) error {
	app, cleanup, err := InitializeApplication(ctx, config)
	if err != nil {
		return fmt.Errorf("build application: %w", err)
	}
	defer cleanup()
	return app.Run(ctx, config.HTTP)
}

func runHealthcheck(ctx context.Context, config *appconfig.Config) error {
	pool, cleanup, err := postgres.NewPool(ctx, poolConfig(config))
	if err != nil {
		return fmt.Errorf("build healthcheck: %w", err)
	}
	defer cleanup()

	checkCtx, cancel := context.WithTimeout(ctx, defaultHealthcheckTimeout)
	defer cancel()
	if err := pool.Ping(checkCtx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}
	return nil
}

func runMigration(ctx context.Context, config *appconfig.Config) error {
	pool, cleanup, err := postgres.NewPool(ctx, poolConfig(config))
	if err != nil {
		return fmt.Errorf("build migration: %w", err)
	}
	defer cleanup()
	if err := postgres.Migrate(ctx, pool, slog.Default()); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}

	email, err := domain.ParseEmail(config.Bootstrap.Email)
	if err != nil {
		return fmt.Errorf("validate bootstrap email: %w", err)
	}
	locale, err := domain.ParseLocale(config.Bootstrap.Locale)
	if err != nil {
		return fmt.Errorf("validate bootstrap locale: %w", err)
	}
	if err := domain.ValidatePassword(config.Bootstrap.Password); err != nil {
		return fmt.Errorf("validate bootstrap password: %w", err)
	}
	hasher, err := security.NewPasswordHasher()
	if err != nil {
		return fmt.Errorf("build password hasher: %w", err)
	}
	hash, err := hasher.Hash(config.Bootstrap.Password)
	if err != nil {
		return fmt.Errorf("hash bootstrap password: %w", err)
	}
	store := postgres.NewStore(pool)
	if err := store.EnsureSuperAdmin(ctx, domain.SuperAdminBootstrap{
		Email: email, PasswordHash: hash, Locale: locale,
	}); err != nil {
		return fmt.Errorf("bootstrap administrator: %w", err)
	}
	return nil
}

// InitializeApplication is the explicit composition root for the API process.
// SMTP deliberately belongs to the worker process and is not constructed here.
func InitializeApplication(
	ctx context.Context,
	config *appconfig.Config,
) (*Application, func(), error) {
	pool, cleanup, err := postgres.NewPool(ctx, poolConfig(config))
	if err != nil {
		return nil, nil, err
	}
	store := postgres.NewStore(pool)

	fail := func(err error) (*Application, func(), error) {
		cleanup()
		return nil, nil, err
	}

	sessions, err := authadapter.NewSessionIssuer(sessionConfig(config))
	if err != nil {
		return fail(err)
	}

	tokens, err := authadapter.NewInvitationTokenSigner(invitationTokenConfig(config))
	if err != nil {
		return fail(err)
	}
	passwords, err := security.NewPasswordHasher()
	if err != nil {
		return fail(err)
	}

	authServices, err := newAuthServices(
		store,
		store,
		store,
		store,
		store,
		store,
		passwords,
		sessions,
		store,
		tokens,
		tokens,
		inviteBaseURL(config),
		inviteTTL(config),
	)
	if err != nil {
		return fail(err)
	}

	catalog, err := localization.NewProductCatalog(store)
	if err != nil {
		return fail(err)
	}
	defaultLocale, err := catalog.DefaultLocale(ctx)
	if err != nil {
		return fail(err)
	}
	tenantAdministration := service.NewTenantAdministration(store)
	localizationAdministration := service.NewLocalizationAdministration(catalog, store)
	auditAdministration := service.NewAuditAdministration(store)
	userAdministration := service.NewUserAdministration(store)
	invitationAdministration := service.NewInvitationAdministration(store)
	systemOverview := service.NewSystemOverview(store)
	tenantManagement := service.NewTenantManagement(
		store,
		store,
		store,
		store,
	)
	i18nService := service.NewI18nService(catalog, catalog)

	translator, err := i18n.NewTranslator(catalog)
	if err != nil {
		return fail(err)
	}

	api, err := newHTTPAdapter(
		authServices.Credentials,
		authServices.Sessions,
		authServices.Invitations,
		authServices.ExternalIdentities,
		tenantAdministration,
		localizationAdministration,
		auditAdministration,
		userAdministration,
		invitationAdministration,
		systemOverview,
		tenantManagement,
		i18nService,
		translator,
		store,
		httpServerConfig(config, defaultLocale),
	)
	if err != nil {
		return fail(err)
	}

	oidc, err := authadapter.NewGoogleOIDC(googleOIDCConfig(config))
	if err != nil {
		return fail(err)
	}

	return NewApplication(
		api,
		oidc,
		httpOIDCConfig(config),
		slog.Default(),
	), cleanup, nil
}
