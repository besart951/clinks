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

var providerSet = wire.NewSet(
	poolConfig,
	httpServerConfig,
	sessionConfig,
	postgres.NewPool,
	postgres.NewUserRepository,
	postgres.NewExternalIdentityRepository,
	postgres.NewTenantProvisioner,
	postgres.NewTenantRepository,
	postgres.NewMembershipRepository,
	postgres.NewAuditRepository,
	postgres.NewLocalizationRepository,
	localization.NewProductCatalog,
	postgres.NewReadiness,
	wire.Bind(new(ports.IdentityRepository), new(*postgres.UserRepository)),
	wire.Bind(new(ports.ExternalIdentityRepository), new(*postgres.ExternalIdentityRepository)),
	wire.Bind(new(ports.TenantProvisioner), new(*postgres.TenantProvisioner)),
	wire.Bind(new(ports.TenantRepository), new(*postgres.TenantRepository)),
	wire.Bind(new(ports.MembershipRepository), new(*postgres.MembershipRepository)),
	wire.Bind(new(ports.AuditLog), new(*postgres.AuditRepository)),
	wire.Bind(new(ports.LocalizationOverrides), new(*postgres.LocalizationRepository)),
	wire.Bind(new(ports.LocalizationCatalog), new(*localization.ProductCatalog)),
	wire.Bind(new(ports.LocalizationEditor), new(*postgres.LocalizationRepository)),
	wire.Bind(new(ports.ReadinessChecker), new(*postgres.Readiness)),
	security.NewPasswordHasher,
	wire.Bind(new(ports.PasswordHasher), new(*security.PasswordHasher)),
	auth.NewSessionIssuer,
	wire.Bind(new(ports.SessionIssuer), new(*auth.SessionIssuer)),
	smtpConfig,
	invitationTokenConfig,
	googleOIDCConfig,
	httpOIDCConfig,
	mailadapter.NewSMTPMailer,
	auth.NewInvitationTokenSigner,
	auth.NewGoogleOIDC,
	wire.Bind(new(ports.InvitationMailer), new(*mailadapter.SMTPMailer)),
	wire.Bind(new(ports.InvitationTokenSigner), new(*auth.InvitationTokenSigner)),
	inviteBaseURL,
	inviteTTL,
	newAuthService,
	service.NewAdminService,
	service.NewI18nService,
	i18n.NewTranslator,
	newHTTPServer,
	NewApplication,
)

func InitializeApplication(context.Context, *appconfig.Config) (*Application, error) {
	wire.Build(providerSet)
	return nil, nil
}
