package clinks

import (
	"context"
)

type LanguageCatalog interface {
	ActiveLanguages(
		ctx context.Context,
	) ([]Language, error)
}

type DefaultLocaleProvider interface {
	DefaultLocale(
		ctx context.Context,
	) (Locale, error)
}

type TranslationCatalog interface {
	DefaultLocaleProvider

	Translations(
		ctx context.Context,
		locale Locale,
		scope ApplicationScope,
	) ([]Translation, error)
}

type MessageCatalog interface {
	DefaultLocaleProvider

	Message(
		ctx context.Context,
		locale Locale,
		key string,
	) (string, error)
}

type LocalizationEditor interface {
	ListLanguages(
		ctx context.Context,
		filter LanguageFilter,
	) (Page[Language], error)

	UpsertLanguage(
		ctx context.Context,
		language Language,
		actorID UserID,
	) (Language, error)

	UpsertTranslationOverride(
		ctx context.Context,
		translation Translation,
		actorID UserID,
	) (Translation, error)

	ListTranslationOverrides(
		ctx context.Context,
		filter TranslationFilter,
	) (Page[Translation], error)

	DeleteTranslationOverride(
		ctx context.Context,
		translation Translation,
		actorID UserID,
	) error
}
