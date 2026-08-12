package service

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type AdminService struct {
	*TenantAdministration
	*LocalizationAdministration
	*AuditAdministration
	*UserAdministration
	*InvitationAdministration
	*SystemOverview
}

func NewAdminService(
	tenants ports.TenantRepository,
	localization ports.LocalizationCatalog,
	editor ports.LocalizationEditor,
	audit ports.AuditReader,
	users ports.AdminUserRepository,
	invitations ports.AdminInvitationRepository,
	stats ports.SystemStatsRepository,
) *AdminService {
	return &AdminService{
		TenantAdministration:       NewTenantAdministration(tenants),
		LocalizationAdministration: NewLocalizationAdministration(localization, editor),
		AuditAdministration:        NewAuditAdministration(audit),
		UserAdministration:         NewUserAdministration(users),
		InvitationAdministration:   NewInvitationAdministration(invitations),
		SystemOverview:             NewSystemOverview(stats),
	}
}

type TenantAdministration struct {
	tenants ports.TenantRepository
}

func NewTenantAdministration(
	tenants ports.TenantRepository,
) *TenantAdministration {
	return &TenantAdministration{
		tenants: tenants,
	}
}

func (administration *TenantAdministration) CreateTenant(
	ctx context.Context,
	name string,
	actorID domain.UserID,
) (domain.Tenant, error) {
	name = strings.TrimSpace(name)

	if utf8.RuneCountInString(name) < 2 ||
		!actorID.IsValid() {
		return domain.Tenant{},
			domain.NewError(domain.ErrorValidation)
	}

	return administration.tenants.Create(
		ctx,
		name,
		actorID,
	)
}

func (administration *TenantAdministration) Tenants(
	ctx context.Context,
) ([]domain.Tenant, error) {
	return administration.tenants.List(ctx)
}

type LocalizationAdministration struct {
	catalog ports.LocalizationCatalog
	editor  ports.LocalizationEditor
}

func NewLocalizationAdministration(
	catalog ports.LocalizationCatalog,
	editor ports.LocalizationEditor,
) *LocalizationAdministration {
	return &LocalizationAdministration{
		catalog: catalog,
		editor:  editor,
	}
}

func (administration *LocalizationAdministration) Languages(
	ctx context.Context,
) ([]domain.Language, error) {
	return administration.catalog.AllLanguages(ctx)
}

func (administration *LocalizationAdministration) SaveLanguage(
	ctx context.Context,
	language domain.Language,
	actorID domain.UserID,
) error {
	language.Code = domain.NewLocale(
		string(language.Code),
	)
	language.Name = strings.TrimSpace(language.Name)

	if !language.Code.IsValid() ||
		language.Name == "" ||
		!actorID.IsValid() {
		return domain.NewError(domain.ErrorValidation)
	}

	defaultLocale, err := administration.catalog.DefaultLocale(ctx)
	if err != nil {
		return err
	}

	if language.Code == defaultLocale {
		if !language.IsDefault || !language.IsActive {
			return domain.NewError(domain.ErrorValidation)
		}
	} else if language.IsDefault {
		return domain.NewError(domain.ErrorValidation)
	}

	return administration.editor.UpsertLanguage(
		ctx,
		language,
		actorID,
	)
}

func (administration *LocalizationAdministration) SaveTranslationOverride(
	ctx context.Context,
	translation domain.Translation,
	actorID domain.UserID,
) error {
	translation.Locale = domain.NewLocale(
		string(translation.Locale),
	)

	scope, err := domain.ParseApplicationScope(
		string(translation.ApplicationScope),
	)
	if err != nil {
		return err
	}

	translation.ApplicationScope = scope
	translation.Key = strings.TrimSpace(translation.Key)

	if !translation.Locale.IsValid() ||
		translation.Key == "" ||
		strings.TrimSpace(translation.Value) == "" ||
		!actorID.IsValid() {
		return domain.NewError(domain.ErrorValidation)
	}

	return administration.editor.UpsertTranslationOverride(
		ctx,
		translation,
		actorID,
	)
}

type AuditAdministration struct {
	audit ports.AuditReader
}

func NewAuditAdministration(
	audit ports.AuditReader,
) *AuditAdministration {
	return &AuditAdministration{
		audit: audit,
	}
}

func (administration *AuditAdministration) AuditEvents(
	ctx context.Context,
	filter *domain.AuditFilter,
) (domain.AuditPage, error) {
	normalized := domain.AuditFilter{
		PageSize: domain.DefaultPageSize,
	}

	if filter != nil {
		normalized = *filter
	}

	normalized.Action = strings.TrimSpace(normalized.Action)
	normalized.Search = strings.TrimSpace(normalized.Search)
	normalized.PageSize = domain.EffectiveLimit(
		normalized.PageSize,
	)

	if !normalized.From.IsZero() &&
		!normalized.To.IsZero() &&
		normalized.From.After(normalized.To) {
		return domain.AuditPage{},
			domain.NewError(domain.ErrorValidation)
	}

	return administration.audit.List(
		ctx,
		normalized,
	)
}

type UserAdministration struct {
	users ports.AdminUserRepository
}

func NewUserAdministration(
	users ports.AdminUserRepository,
) *UserAdministration {
	return &UserAdministration{
		users: users,
	}
}

func (administration *UserAdministration) ListUsers(
	ctx context.Context,
	filter domain.UserFilter,
) (domain.Page[domain.UserSummary], error) {
	filter.Search = strings.TrimSpace(filter.Search)
	filter.Limit = domain.EffectiveLimit(filter.Limit)

	return administration.users.ListUsers(
		ctx,
		filter,
	)
}

func (administration *UserAdministration) GetUser(
	ctx context.Context,
	userID domain.UserID,
) (domain.UserDetail, error) {
	if !userID.IsValid() {
		return domain.UserDetail{},
			domain.NewError(domain.ErrorValidation)
	}

	return administration.users.GetUser(
		ctx,
		userID,
	)
}

type InvitationAdministration struct {
	invitations ports.AdminInvitationRepository
}

func NewInvitationAdministration(
	invitations ports.AdminInvitationRepository,
) *InvitationAdministration {
	return &InvitationAdministration{
		invitations: invitations,
	}
}

func (administration *InvitationAdministration) ListInvitations(
	ctx context.Context,
	filter domain.InvitationFilter,
) (domain.Page[domain.Invitation], error) {
	filter.Search = strings.TrimSpace(filter.Search)
	filter.Limit = domain.EffectiveLimit(filter.Limit)

	if !filter.Status.IsValid() {
		return domain.Page[domain.Invitation]{},
			domain.NewError(domain.ErrorValidation)
	}

	if filter.TenantID != nil &&
		!filter.TenantID.IsValid() {
		return domain.Page[domain.Invitation]{},
			domain.NewError(domain.ErrorValidation)
	}

	return administration.invitations.ListInvitations(
		ctx,
		filter,
	)
}

func (administration *InvitationAdministration) RevokeInvitation(
	ctx context.Context,
	invitationID domain.InvitationID,
) error {
	if strings.TrimSpace(string(invitationID)) == "" {
		return domain.NewError(domain.ErrorValidation)
	}

	return administration.invitations.RevokeInvitation(
		ctx,
		invitationID,
	)
}

func validInvitationFilterStatus(status string) bool {
	switch status {
	case "",
		"pending",
		"used",
		"expired":
		return true

	default:
		return false
	}
}

type SystemOverview struct {
	stats ports.SystemStatsRepository
}

func NewSystemOverview(
	stats ports.SystemStatsRepository,
) *SystemOverview {
	return &SystemOverview{
		stats: stats,
	}
}

func (overview *SystemOverview) Stats(
	ctx context.Context,
) (domain.SystemStats, error) {
	return overview.stats.Stats(ctx)
}
