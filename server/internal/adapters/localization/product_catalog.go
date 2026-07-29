// Package localization provides the source-controlled product translation catalog.
package localization

import (
	"context"
	"fmt"
	"sort"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

// ProductCatalog combines immutable product texts with database Translation Overrides.
type ProductCatalog struct {
	overrides ports.LocalizationOverrides
}

func NewProductCatalog(overrides ports.LocalizationOverrides) *ProductCatalog {
	return &ProductCatalog{overrides: overrides}
}

func (catalog *ProductCatalog) ActiveLanguages(ctx context.Context) ([]domain.Language, error) {
	return catalog.overrides.ActiveLanguages(ctx)
}

func (catalog *ProductCatalog) AllLanguages(ctx context.Context) ([]domain.Language, error) {
	return catalog.overrides.AllLanguages(ctx)
}

func (catalog *ProductCatalog) DefaultLocale(context.Context) (domain.Locale, error) {
	return productDefaultLocale, nil
}

func (*ProductCatalog) FallbackMessage() string {
	for _, translation := range productTranslations(productDefaultLocale, domain.ScopeShared) {
		if translation.Key == "error.internal" {
			return translation.Value
		}
	}
	return "error.internal"
}

func (catalog *ProductCatalog) Translations(
	ctx context.Context,
	locale domain.Locale,
	scope domain.ApplicationScope,
) ([]domain.Translation, error) {
	overrides, err := catalog.overrides.Translations(ctx, locale, scope)
	if err != nil {
		return nil, err
	}
	return mergeTranslations(productTranslations(locale, scope), overrides), nil
}

func (catalog *ProductCatalog) Message(ctx context.Context, locale domain.Locale, key string) (string, error) {
	translations, err := catalog.Translations(ctx, locale, domain.ScopeShared)
	if err != nil {
		return "", err
	}
	for _, translation := range translations {
		if translation.Key == key {
			return translation.Value, nil
		}
	}
	return "", fmt.Errorf("find translation: %s", key)
}

func productTranslations(locale domain.Locale, scope domain.ApplicationScope) []domain.Translation {
	byKey := make(map[string]domain.Translation)
	for _, translation := range productTranslationEntries {
		if translation.Locale == locale && translation.ApplicationScope == domain.ScopeShared {
			byKey[translation.Key] = translation
		}
	}
	if scope != domain.ScopeShared {
		for _, translation := range productTranslationEntries {
			if translation.Locale == locale && translation.ApplicationScope == scope {
				byKey[translation.Key] = translation
			}
		}
	}
	translations := make([]domain.Translation, 0, len(byKey))
	for _, translation := range byKey {
		translations = append(translations, translation)
	}
	sortTranslations(translations)
	return translations
}

func mergeTranslations(baseline, overrides []domain.Translation) []domain.Translation {
	byKey := make(map[string]domain.Translation, len(baseline)+len(overrides))
	for _, translation := range baseline {
		byKey[translation.Key] = translation
	}
	for _, translation := range overrides {
		byKey[translation.Key] = translation
	}
	translations := make([]domain.Translation, 0, len(byKey))
	for _, translation := range byKey {
		translations = append(translations, translation)
	}
	sortTranslations(translations)
	return translations
}

func sortTranslations(translations []domain.Translation) {
	sort.Slice(translations, func(left, right int) bool {
		return translations[left].Key < translations[right].Key
	})
}
