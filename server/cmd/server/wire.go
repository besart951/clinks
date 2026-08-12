//go:build wireinject

package main

import (
	"context"

	"github.com/google/wire"

	"github.com/besartmorina/clinks/server/internal/adapters/auth"
	"github.com/besartmorina/clinks/server/internal/adapters/i18n"
	"github.com/besartmorina/clinks/server/internal/adapters/localization"
	mailadapter "github.com/besartmorina/clinks/server/internal/adapters/mail"
	"github.com/besartmorina/clinks/server/internal/adapters/postgres"
	"github.com/besartmorina/clinks/server/internal/adapters/security"
	appconfig "github.com/besartmorina/clinks/server/internal/config"
	"github.com/besartmorina/clinks/server/internal/core/ports"
	"github.com/besartmorina/clinks/server/internal/core/service"
)

var configSet = wire.NewSet(
	poolConfig,
	httpServerConfig,
	sessionConfig,
	smtpConfig,
	invitationTokenConfig,
	googleOIDCConfig,
	httpOIDCConfig,
	inviteBaseURL,
	inviteTTL,
)

var postgresSet = wire.NewSet(
	postgres.NewPool,

	postgres.NewUserRepository,
	wire.Bind(
		new(ports.IdentityRepository),
		new(*postgres.UserRepository),
	),

	postgres.NewExternalIdentityRepository,
	wire.Bind(
		new(ports.ExternalIdentityRepository),
		new(*postgres.ExternalIdentityRepository),
	),

	postgres.NewTenantProvisioner,
	wire.Bind(
		new(ports.TenantProvisioner),
		new(*postgres.TenantProvisioner),
	),

	postgres.NewTenantRepository,
	wire.Bind(
		new(ports.TenantRepository),
		new(*postgres.TenantRepository),
	),

	postgres.NewMembershipRepository,
	wire.Bind(
		new(ports.MembershipRepository),
		new(*postgres.MembershipRepository),
	),

	postgres.NewAuditRepository,
	wire.Bind(
		new(ports.AuditLog),
		new(*postgres.AuditRepository),
	),

	postgres.NewLocalizationRepository,
	wire.Bind(
		new(ports.LocalizationOverrides),
		new(*postgres.LocalizationRepository),
	),
	wire.Bind(
		new(ports.LocalizationEditor),
		new(*postgres.LocalizationRepository),
	),

	postgres.NewAdminUserRepository,
	wire.Bind(
		new(ports.AdminUserRepository),
		new(*postgres.AdminUserRepository),
	),

	postgres.NewAdminInvitationRepository,
	wire.Bind(
		new(ports.AdminInvitationRepository),
		new(*postgres.AdminInvitationRepository),
	),

	postgres.NewSystemStatsRepository,
	wire.Bind(
		new(ports.SystemStatsRepository),
		new(*postgres.SystemStatsRepository),
	),

	postgres.NewReadiness,
	wire.Bind(
		new(ports.ReadinessChecker),
		new(*postgres.Readiness),
	),
)

var securitySet = wire.NewSet(
	security.NewPasswordHasher,
	wire.Bind(
		new(ports.PasswordHasher),
		new(*security.PasswordHasher),
	),
)

var authSet = wire.NewSet(
	auth.NewSessionIssuer,
	wire.Bind(
		new(ports.SessionIssuer),
		new(*auth.SessionIssuer),
	),

	auth.NewInvitationTokenSigner,
	wire.Bind(
		new(ports.InvitationTokenSigner),
		new(*auth.InvitationTokenSigner),
	),

	auth.NewGoogleOIDC,
)

var mailSet = wire.NewSet(
	mailadapter.NewSMTPMailer,
	wire.Bind(
		new(ports.InvitationMailer),
		new(*mailadapter.SMTPMailer),
	),
)

var localizationSet = wire.NewSet(
	localization.NewProductCatalog,
	wire.Bind(
		new(ports.LocalizationCatalog),
		new(*localization.ProductCatalog),
	),

	i18n.NewTranslator,
)

var serviceSet = wire.NewSet(
	newAuthService,
	service.NewAdminService,
	service.NewI18nService,
)

var httpSet = wire.NewSet(
	newHTTPAdapter,
	NewApplication,
)

var providerSet = wire.NewSet(
	configSet,
	postgresSet,
	securitySet,
	authSet,
	mailSet,
	localizationSet,
	serviceSet,
	httpSet,
)

// InitializeApplication constructs the application dependency graph.
func InitializeApplication(
	ctx context.Context,
	config *appconfig.Config,
) (*Application, func(), error) {
	wire.Build(providerSet)

	return nil, nil, nil
}
