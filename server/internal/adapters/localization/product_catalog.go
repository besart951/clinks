// Package localization provides the source-controlled product translation catalog.
package localization

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

var ErrNilOverrides = errors.New("localization overrides port is nil")

type ProductCatalog struct {
	overrides ports.LocalizationOverrides
}

func NewProductCatalog(overrides ports.LocalizationOverrides) *ProductCatalog {
	return &ProductCatalog{overrides: overrides}
}

func (catalog *ProductCatalog) ActiveLanguages(ctx context.Context) ([]domain.Language, error) {
	if catalog.overrides == nil {
		return nil, ErrNilOverrides
	}
	return catalog.overrides.ActiveLanguages(ctx)
}

func (catalog *ProductCatalog) AllLanguages(ctx context.Context) ([]domain.Language, error) {
	if catalog.overrides == nil {
		return nil, ErrNilOverrides
	}
	return catalog.overrides.AllLanguages(ctx)
}

func (catalog *ProductCatalog) DefaultLocale(context.Context) (domain.Locale, error) {
	return productDefaultLocale, nil
}

func (*ProductCatalog) FallbackMessage() string {
	for i := range productTranslationEntries {
		entry := productTranslationEntries[i]
		if entry.Locale == productDefaultLocale &&
			entry.ApplicationScope == domain.ScopeShared &&
			entry.Key == "error.internal" {
			return entry.Value
		}
	}
	return "error.internal"
}

func (catalog *ProductCatalog) Translations(
	ctx context.Context,
	locale domain.Locale,
	scope domain.ApplicationScope,
) ([]domain.Translation, error) {
	var overrides []domain.Translation
	if catalog.overrides != nil {
		var err error
		overrides, err = catalog.overrides.Translations(ctx, locale, scope)
		if err != nil {
			return nil, err
		}
	}

	baseline := productTranslations(locale, scope)
	return mergeTranslations(baseline, overrides), nil
}

func (catalog *ProductCatalog) Message(ctx context.Context, locale domain.Locale, key string) (string, error) {
	translations, err := catalog.Translations(ctx, locale, domain.ScopeShared)
	if err != nil {
		return "", err
	}

	for i := range translations {
		if translations[i].Key == key {
			return translations[i].Value, nil
		}
	}
	return "", fmt.Errorf("find translation: %s", key)
}

func productTranslations(locale domain.Locale, scope domain.ApplicationScope) []domain.Translation {
	byKey := make(map[string]domain.Translation)

	for i := range productTranslationEntries {
		entry := productTranslationEntries[i]
		if entry.Locale != locale {
			continue
		}

		if entry.ApplicationScope == scope && scope != domain.ScopeShared {
			byKey[entry.Key] = entry
		} else if entry.ApplicationScope == domain.ScopeShared {
			if existing, found := byKey[entry.Key]; !found || existing.ApplicationScope != scope {
				byKey[entry.Key] = entry
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
	if len(overrides) == 0 {
		return baseline
	}

	byKey := make(map[string]domain.Translation, len(baseline)+len(overrides))
	for i := range baseline {
		byKey[baseline[i].Key] = baseline[i]
	}
	for i := range overrides {
		byKey[overrides[i].Key] = overrides[i]
	}

	translations := make([]domain.Translation, 0, len(byKey))
	for _, translation := range byKey {
		translations = append(translations, translation)
	}

	sortTranslations(translations)
	return translations
}

func sortTranslations(translations []domain.Translation) {
	sort.Slice(translations, func(i, j int) bool {
		return translations[i].Key < translations[j].Key
	})
}
