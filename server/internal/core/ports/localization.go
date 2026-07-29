package ports

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type LocalizationCatalog interface {
	ActiveLanguages(context.Context) ([]domain.Language, error)
	AllLanguages(context.Context) ([]domain.Language, error)
	DefaultLocale(context.Context) (domain.Locale, error)
	Translations(context.Context, domain.Locale, domain.ApplicationScope) ([]domain.Translation, error)
	Message(context.Context, domain.Locale, string) (string, error)
	FallbackMessage() string
}

// LocalizationOverrides exposes languages and administrator-managed translation overlays.
type LocalizationOverrides interface {
	ActiveLanguages(context.Context) ([]domain.Language, error)
	AllLanguages(context.Context) ([]domain.Language, error)
	Translations(context.Context, domain.Locale, domain.ApplicationScope) ([]domain.Translation, error)
}

type LocalizationEditor interface {
	UpsertLanguage(context.Context, domain.Language, domain.UserID) error
	UpsertTranslationOverride(context.Context, domain.Translation, domain.UserID) error
}
