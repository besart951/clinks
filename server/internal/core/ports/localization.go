package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type LocalizationCatalog interface {
	ActiveLanguages(
		ctx context.Context,
	) ([]domain.Language, error)

	AllLanguages(
		ctx context.Context,
	) ([]domain.Language, error)

	DefaultLocale(
		ctx context.Context,
	) (domain.Locale, error)

	Translations(
		ctx context.Context,
		locale domain.Locale,
		scope domain.ApplicationScope,
	) ([]domain.Translation, error)

	Message(
		ctx context.Context,
		locale domain.Locale,
		key string,
	) (string, error)

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
	UpsertLanguage(
		ctx context.Context,
		language domain.Language,
		actorID domain.UserID,
	) error

	UpsertTranslationOverride(
		ctx context.Context,
		translation domain.Translation,
		actorID domain.UserID,
	) error
}
