package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type LanguageCatalog interface {
	ActiveLanguages(
		ctx context.Context,
	) ([]domain.Language, error)
}

type DefaultLocaleProvider interface {
	DefaultLocale(
		ctx context.Context,
	) (domain.Locale, error)
}

type TranslationCatalog interface {
	DefaultLocaleProvider

	Translations(
		ctx context.Context,
		locale domain.Locale,
		scope domain.ApplicationScope,
	) ([]domain.Translation, error)
}

type MessageCatalog interface {
	DefaultLocaleProvider

	Message(
		ctx context.Context,
		locale domain.Locale,
		key string,
	) (string, error)
}

type ErrorCatalog interface {
	MessageCatalog
	FallbackMessage() string
}

type LocalizationOverrides interface {
	ActiveLanguages(
		ctx context.Context,
	) ([]domain.Language, error)

	AllLanguages(
		ctx context.Context,
	) ([]domain.Language, error)

	Translations(
		ctx context.Context,
		locale domain.Locale,
		scope domain.ApplicationScope,
	) ([]domain.Translation, error)
}

type LocalizationEditor interface {
	ListLanguages(
		ctx context.Context,
		filter domain.LanguageFilter,
	) (domain.Page[domain.Language], error)

	UpsertLanguage(
		ctx context.Context,
		language domain.Language,
		actorID domain.UserID,
	) (domain.Language, error)

	UpsertTranslationOverride(
		ctx context.Context,
		translation domain.Translation,
		actorID domain.UserID,
	) (domain.Translation, error)

	ListTranslationOverrides(
		ctx context.Context,
		filter domain.TranslationFilter,
	) (domain.Page[domain.Translation], error)

	DeleteTranslationOverride(
		ctx context.Context,
		translation domain.Translation,
		actorID domain.UserID,
	) error
}
