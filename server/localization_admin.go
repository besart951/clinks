package clinks

import (
	"context"
	"strings"
)

type LocalizationAdmin struct {
	catalog DefaultLocaleProvider
	editor  LocalizationEditor
}

func NewLocalizationAdmin(catalog DefaultLocaleProvider, editor LocalizationEditor) *LocalizationAdmin {
	return &LocalizationAdmin{catalog: catalog, editor: editor}
}

func (administration *LocalizationAdmin) Languages(ctx context.Context, filter LanguageFilter) (Page[Language], error) {
	filter, err := filter.Normalized()
	if err != nil {
		return Page[Language]{}, err
	}
	return administration.editor.ListLanguages(ctx, filter)
}

func (administration *LocalizationAdmin) SaveLanguage(ctx context.Context, language Language, actorID UserID) (Language, error) {
	language.Code = NewLocale(string(language.Code))
	language.Name = strings.TrimSpace(language.Name)
	if !language.Code.IsValid() || language.Name == "" || !actorID.IsValid() {
		return Language{}, NewError(ErrorValidation)
	}
	defaultLocale, err := administration.catalog.DefaultLocale(ctx)
	if err != nil {
		return Language{}, err
	}
	if language.Code == defaultLocale {
		language.IsDefault = true
		if !language.IsActive {
			return Language{}, NewError(ErrorValidation)
		}
	} else {
		language.IsDefault = false
	}
	return administration.editor.UpsertLanguage(ctx, language, actorID)
}

func (administration *LocalizationAdmin) SaveTranslationOverride(ctx context.Context, translation Translation, actorID UserID) (Translation, error) {
	translation.Locale = NewLocale(string(translation.Locale))
	scope, err := ParseApplicationScope(string(translation.ApplicationScope))
	if err != nil {
		return Translation{}, err
	}
	translation.ApplicationScope = scope
	translation.Key = strings.TrimSpace(translation.Key)
	if !translation.Locale.IsValid() || ValidateTranslation(translation.Key, translation.Value) != nil || !actorID.IsValid() {
		return Translation{}, NewError(ErrorValidation)
	}
	return administration.editor.UpsertTranslationOverride(ctx, translation, actorID)
}

func (administration *LocalizationAdmin) TranslationOverrides(ctx context.Context, filter TranslationFilter) (Page[Translation], error) {
	filter, err := filter.Normalized()
	if err != nil {
		return Page[Translation]{}, err
	}
	return administration.editor.ListTranslationOverrides(ctx, filter)
}

func (administration *LocalizationAdmin) DeleteTranslationOverride(ctx context.Context, translation Translation, actorID UserID) error {
	translation.Locale = NewLocale(string(translation.Locale))
	scope, err := ParseApplicationScope(string(translation.ApplicationScope))
	if err != nil {
		return err
	}
	translation.ApplicationScope = scope
	translation.Key = strings.TrimSpace(translation.Key)
	if !translation.Locale.IsValid() || translation.Key == "" || translation.Revision == 0 || !actorID.IsValid() {
		return NewError(ErrorValidation)
	}
	return administration.editor.DeleteTranslationOverride(ctx, translation, actorID)
}
