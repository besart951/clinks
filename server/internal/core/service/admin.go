package service

import (
	"context"
	"strings"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type AdminService struct {
	*TenantAdministration
	*LocalizationAdministration
	*AuditLog
}

func NewAdminService(tenants ports.TenantRepository, localization ports.LocalizationCatalog, editor ports.LocalizationEditor, audit ports.AuditLog) *AdminService {
	return &AdminService{
		TenantAdministration:       NewTenantAdministration(tenants),
		LocalizationAdministration: NewLocalizationAdministration(localization, editor),
		AuditLog:                   NewAuditLog(audit),
	}
}

type TenantAdministration struct {
	tenants ports.TenantRepository
}

func NewTenantAdministration(tenants ports.TenantRepository) *TenantAdministration {
	return &TenantAdministration{tenants: tenants}
}

func (administration *TenantAdministration) CreateTenant(ctx context.Context, name string, actor domain.UserID) (domain.Tenant, error) {
	if len(strings.TrimSpace(name)) < 2 {
		return domain.Tenant{}, domain.NewError(domain.ErrorValidation)
	}
	return administration.tenants.Create(ctx, name, actor)
}

func (administration *TenantAdministration) Tenants(ctx context.Context) ([]domain.Tenant, error) {
	return administration.tenants.List(ctx)
}

type LocalizationAdministration struct {
	localization     ports.LocalizationCatalog
	localizationEdit ports.LocalizationEditor
}

func NewLocalizationAdministration(localization ports.LocalizationCatalog, editor ports.LocalizationEditor) *LocalizationAdministration {
	return &LocalizationAdministration{localization: localization, localizationEdit: editor}
}

func (administration *LocalizationAdministration) Languages(ctx context.Context) ([]domain.Language, error) {
	return administration.localization.AllLanguages(ctx)
}

func (administration *LocalizationAdministration) SaveLanguage(ctx context.Context, language domain.Language, actor domain.UserID) error {
	if !language.Code.IsValid() || strings.TrimSpace(language.Name) == "" {
		return domain.NewError(domain.ErrorValidation)
	}
	defaultLocale, err := administration.localization.DefaultLocale(ctx)
	if err != nil {
		return err
	}
	if (language.Code == defaultLocale && (!language.IsDefault || !language.IsActive)) || (language.Code != defaultLocale && language.IsDefault) {
		return domain.NewError(domain.ErrorValidation)
	}
	return administration.localizationEdit.UpsertLanguage(ctx, language, actor)
}

func (administration *LocalizationAdministration) SaveTranslationOverride(ctx context.Context, translation domain.Translation, actor domain.UserID) error {
	if !translation.Locale.IsValid() || !translation.ApplicationScope.IsValid() || strings.TrimSpace(translation.Key) == "" || strings.TrimSpace(translation.Value) == "" {
		return domain.NewError(domain.ErrorValidation)
	}
	return administration.localizationEdit.UpsertTranslationOverride(ctx, translation, actor)
}

type AuditLog struct {
	audit ports.AuditLog
}

func NewAuditLog(audit ports.AuditLog) *AuditLog {
	return &AuditLog{audit: audit}
}

func (log *AuditLog) AuditEvents(ctx context.Context, filter *domain.AuditFilter) (domain.AuditPage, error) {
	return log.audit.List(ctx, filter)
}
