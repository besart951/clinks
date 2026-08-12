package main

import (
	"context"
	"fmt"
	"log/slog"

	clinks "github.com/besartmorina/clinks/server"
	"github.com/besartmorina/clinks/server/auth"
	appconfig "github.com/besartmorina/clinks/server/config"
	"github.com/besartmorina/clinks/server/localization"
	"github.com/besartmorina/clinks/server/postgres"
	"github.com/besartmorina/clinks/server/web"
)

func runServer(ctx context.Context, config *appconfig.Config) error {
	app, cleanup, err := initializeApplication(ctx, config)
	if err != nil {
		return fmt.Errorf("build application: %w", err)
	}
	defer cleanup()
	return app.run(ctx, config.HTTP)
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

	email, err := clinks.ParseEmail(config.Bootstrap.Email)
	if err != nil {
		return fmt.Errorf("validate bootstrap email: %w", err)
	}
	locale, err := clinks.ParseLocale(config.Bootstrap.Locale)
	if err != nil {
		return fmt.Errorf("validate bootstrap locale: %w", err)
	}
	if err := clinks.ValidatePassword(config.Bootstrap.Password); err != nil {
		return fmt.Errorf("validate bootstrap password: %w", err)
	}
	hasher, err := auth.NewPasswordHasher()
	if err != nil {
		return fmt.Errorf("build password hasher: %w", err)
	}
	hash, err := hasher.Hash(config.Bootstrap.Password)
	if err != nil {
		return fmt.Errorf("hash bootstrap password: %w", err)
	}
	store := postgres.NewStore(pool)
	if err := store.EnsureSuperAdmin(ctx, clinks.SuperAdminBootstrap{
		Email: email, PasswordHash: hash, Locale: locale,
	}); err != nil {
		return fmt.Errorf("bootstrap administrator: %w", err)
	}
	return nil
}

// The API composition root deliberately does not construct SMTP.
func initializeApplication(
	ctx context.Context,
	config *appconfig.Config,
) (*application, func(), error) {
	pool, cleanup, err := postgres.NewPool(ctx, poolConfig(config))
	if err != nil {
		return nil, nil, err
	}
	store := postgres.NewStore(pool)

	fail := func(err error) (*application, func(), error) {
		cleanup()
		return nil, nil, err
	}

	sessions, err := auth.NewSessionIssuer(sessionConfig(config))
	if err != nil {
		return fail(err)
	}

	tokens, err := auth.NewInvitationTokenSigner(invitationTokenConfig(config))
	if err != nil {
		return fail(err)
	}
	passwords, err := auth.NewPasswordHasher()
	if err != nil {
		return fail(err)
	}

	authentication, err := clinks.NewAuth(clinks.AuthDependencies{
		Identities:    store,
		Federation:    store,
		Provisioner:   store,
		Memberships:   store,
		Roles:         store,
		Invitations:   store,
		Passwords:     passwords,
		Sessions:      sessions,
		Audit:         store,
		InvitationIDs: tokens,
		Tokens:        tokens,
		InviteBaseURL: inviteBaseURL(config),
		InviteTTL:     inviteTTL(config),
	})
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
	tenants := clinks.NewTenantAdmin(store)
	localizationAdmin := clinks.NewLocalizationAdmin(catalog, store)
	auditLog := clinks.NewAuditLog(store)
	users := clinks.NewUsers(store)
	invitationAdmin := clinks.NewInvitationAdmin(store)
	tenantAccess := clinks.NewTenantAccess(
		store,
		store,
		store,
		store,
	)
	translations := clinks.NewTranslations(catalog, catalog)

	translator, err := localization.NewTranslator(catalog)
	if err != nil {
		return fail(err)
	}

	api, err := web.NewServer(web.ServerDeps{
		Auth: web.AuthDeps{
			Sessions:     authentication,
			Credentials:  authentication,
			OIDCSessions: authentication,
			Registration: authentication,
			Invitations:  authentication,
		},
		Admin: web.AdminDeps{
			Tenants:          tenants,
			LocalizationEdit: localizationAdmin,
			Audit:            auditLog,
			Users:            users,
			InviteAdmin:      invitationAdmin,
			Overview:         store,
		},
		Localization: web.LocalizationDeps{
			Catalog:    translations,
			Translator: translator,
		},
		Readiness:    store,
		TenantAccess: tenantAccess,
		Logger:       slog.Default(),
	}, httpServerConfig(config, defaultLocale))
	if err != nil {
		return fail(err)
	}

	oidc, err := auth.NewGoogleOIDC(googleOIDCConfig(config))
	if err != nil {
		return fail(err)
	}

	return newApplication(
		api,
		oidc,
		httpOIDCConfig(config),
		slog.Default(),
	), cleanup, nil
}
