package service

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type I18nService struct {
	catalog ports.LocalizationCatalog
}

func NewI18nService(catalog ports.LocalizationCatalog) *I18nService {
	return &I18nService{catalog: catalog}
}

func (service *I18nService) ActiveLanguages(
	ctx context.Context,
) ([]domain.Language, error) {
	return service.catalog.ActiveLanguages(ctx)
}

func (service *I18nService) TranslationBundle(
	ctx context.Context,
	locale domain.Locale,
	scope domain.ApplicationScope,
) (domain.TranslationBundle, error) {
	translations, err := service.catalog.Translations(ctx, locale, scope)
	if err != nil {
		return domain.TranslationBundle{Locale: locale, Translations: translations}, err
	}
	defaultLocale, err := service.catalog.DefaultLocale(ctx)
	if err != nil || defaultLocale == locale {
		return domain.TranslationBundle{Locale: locale, Translations: translations}, err
	}
	defaultTranslations, err := service.catalog.Translations(ctx, defaultLocale, scope)
	if err != nil {
		return domain.TranslationBundle{Locale: locale, Translations: translations}, err
	}
	if len(translations) == 0 {
		return domain.TranslationBundle{Locale: defaultLocale, Translations: defaultTranslations}, nil
	}
	return domain.TranslationBundle{
		Locale:       locale,
		Translations: mergeTranslations(defaultTranslations, translations),
	}, nil
}

func mergeTranslations(fallback, overrides []domain.Translation) []domain.Translation {
	byKey := make(map[string]domain.Translation, len(fallback)+len(overrides))
	for _, translation := range overrides {
		byKey[translation.Key] = translation
	}
	translations := make([]domain.Translation, 0, len(fallback)+len(overrides))
	for _, translation := range fallback {
		if override, found := byKey[translation.Key]; found {
			translations = append(translations, override)
			delete(byKey, translation.Key)
			continue
		}
		translations = append(translations, translation)
	}
	for _, translation := range overrides {
		if override, found := byKey[translation.Key]; found {
			translations = append(translations, override)
			delete(byKey, translation.Key)
		}
	}
	return translations
}
