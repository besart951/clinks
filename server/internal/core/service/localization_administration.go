package service

import (
	"context"
	"strings"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type LocalizationAdministration struct {
	catalog ports.DefaultLocaleProvider
	editor  ports.LocalizationEditor
}

func NewLocalizationAdministration(catalog ports.DefaultLocaleProvider, editor ports.LocalizationEditor) *LocalizationAdministration {
	return &LocalizationAdministration{catalog: catalog, editor: editor}
}

func (administration *LocalizationAdministration) Languages(ctx context.Context, filter domain.LanguageFilter) (domain.Page[domain.Language], error) {
	filter, err := filter.Normalized()
	if err != nil {
		return domain.Page[domain.Language]{}, err
	}
	return administration.editor.ListLanguages(ctx, filter)
}

func (administration *LocalizationAdministration) SaveLanguage(ctx context.Context, language domain.Language, actorID domain.UserID) (domain.Language, error) {
	language.Code = domain.NewLocale(string(language.Code))
	language.Name = strings.TrimSpace(language.Name)
	if !language.Code.IsValid() || language.Name == "" || !actorID.IsValid() {
		return domain.Language{}, domain.NewError(domain.ErrorValidation)
	}
	defaultLocale, err := administration.catalog.DefaultLocale(ctx)
	if err != nil {
		return domain.Language{}, err
	}
	if language.Code == defaultLocale {
		language.IsDefault = true
		if !language.IsActive {
			return domain.Language{}, domain.NewError(domain.ErrorValidation)
		}
	} else {
		language.IsDefault = false
	}
	return administration.editor.UpsertLanguage(ctx, language, actorID)
}

func (administration *LocalizationAdministration) SaveTranslationOverride(ctx context.Context, translation domain.Translation, actorID domain.UserID) (domain.Translation, error) {
	translation.Locale = domain.NewLocale(string(translation.Locale))
	scope, err := domain.ParseApplicationScope(string(translation.ApplicationScope))
	if err != nil {
		return domain.Translation{}, err
	}
	translation.ApplicationScope = scope
	translation.Key = strings.TrimSpace(translation.Key)
	if !translation.Locale.IsValid() || domain.ValidateTranslation(translation.Key, translation.Value) != nil || !actorID.IsValid() {
		return domain.Translation{}, domain.NewError(domain.ErrorValidation)
	}
	return administration.editor.UpsertTranslationOverride(ctx, translation, actorID)
}

func (administration *LocalizationAdministration) TranslationOverrides(ctx context.Context, filter domain.TranslationFilter) (domain.Page[domain.Translation], error) {
	filter, err := filter.Normalized()
	if err != nil {
		return domain.Page[domain.Translation]{}, err
	}
	return administration.editor.ListTranslationOverrides(ctx, filter)
}

func (administration *LocalizationAdministration) DeleteTranslationOverride(ctx context.Context, translation domain.Translation, actorID domain.UserID) error {
	translation.Locale = domain.NewLocale(string(translation.Locale))
	scope, err := domain.ParseApplicationScope(string(translation.ApplicationScope))
	if err != nil {
		return err
	}
	translation.ApplicationScope = scope
	translation.Key = strings.TrimSpace(translation.Key)
	if !translation.Locale.IsValid() || translation.Key == "" || translation.Revision == 0 || !actorID.IsValid() {
		return domain.NewError(domain.ErrorValidation)
	}
	return administration.editor.DeleteTranslationOverride(ctx, translation, actorID)
}
