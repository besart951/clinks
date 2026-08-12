package service

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type I18nService struct {
	catalog ports.LocalizationCatalog
}

func NewI18nService(
	catalog ports.LocalizationCatalog,
) *I18nService {
	return &I18nService{
		catalog: catalog,
	}
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
	if !scope.IsValid() {
		return domain.TranslationBundle{},
			domain.NewError(domain.ErrorValidation)
	}

	locale = domain.NewLocale(string(locale))

	if !locale.IsValid() {
		return domain.TranslationBundle{},
			domain.NewError(domain.ErrorValidation)
	}

	translations, err := service.catalog.Translations(
		ctx,
		locale,
		scope,
	)
	if err != nil {
		return domain.TranslationBundle{}, err
	}

	defaultLocale, err := service.catalog.DefaultLocale(ctx)
	if err != nil {
		return domain.TranslationBundle{}, err
	}

	if locale == defaultLocale {
		return domain.TranslationBundle{
			Locale:       locale,
			Translations: translations,
		}, nil
	}

	fallbackTranslations, err :=
		service.catalog.Translations(
			ctx,
			defaultLocale,
			scope,
		)
	if err != nil {
		return domain.TranslationBundle{}, err
	}

	if len(translations) == 0 {
		return domain.TranslationBundle{
			Locale:       defaultLocale,
			Translations: fallbackTranslations,
		}, nil
	}

	return domain.TranslationBundle{
		Locale: locale,
		Translations: mergeTranslations(
			fallbackTranslations,
			translations,
		),
	}, nil
}

func mergeTranslations(
	fallback,
	overrides []domain.Translation,
) []domain.Translation {
	result := make(
		[]domain.Translation,
		len(fallback),
		len(fallback)+len(overrides),
	)

	copy(result, fallback)

	indexByKey := make(
		map[string]int,
		len(fallback)+len(overrides),
	)

	for index, translation := range result {
		indexByKey[translation.Key] = index
	}

	for _, override := range overrides {
		if index, found := indexByKey[override.Key]; found {
			result[index] = override
			continue
		}

		indexByKey[override.Key] = len(result)
		result = append(result, override)
	}

	return result
}
