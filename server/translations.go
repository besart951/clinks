package clinks

import (
	"context"
)

type Translations struct {
	languages LanguageCatalog
	catalog   TranslationCatalog
}

func NewTranslations(
	languages LanguageCatalog,
	catalog TranslationCatalog,
) *Translations {
	return &Translations{
		languages: languages,
		catalog:   catalog,
	}
}

func (service *Translations) ActiveLanguages(
	ctx context.Context,
) ([]Language, error) {
	return service.languages.ActiveLanguages(ctx)
}

func (service *Translations) TranslationBundle(
	ctx context.Context,
	locale Locale,
	scope ApplicationScope,
) (TranslationBundle, error) {
	if !scope.IsValid() {
		return TranslationBundle{},
			NewError(ErrorValidation)
	}

	locale = NewLocale(string(locale))

	if !locale.IsValid() {
		return TranslationBundle{},
			NewError(ErrorValidation)
	}

	translations, err := service.catalog.Translations(
		ctx,
		locale,
		scope,
	)
	if err != nil {
		return TranslationBundle{}, err
	}

	defaultLocale, err := service.catalog.DefaultLocale(ctx)
	if err != nil {
		return TranslationBundle{}, err
	}

	if locale == defaultLocale {
		return TranslationBundle{
			Locale:       locale,
			Translations: translations,
		}, nil
	}

	fallbackTranslations, err := service.catalog.Translations(
		ctx,
		defaultLocale,
		scope,
	)
	if err != nil {
		return TranslationBundle{}, err
	}

	if len(translations) == 0 {
		return TranslationBundle{
			Locale:       defaultLocale,
			Translations: fallbackTranslations,
		}, nil
	}

	return TranslationBundle{
		Locale: locale,
		Translations: mergeTranslations(
			fallbackTranslations,
			translations,
		),
	}, nil
}

func mergeTranslations(
	fallback,
	overrides []Translation,
) []Translation {
	result := make(
		[]Translation,
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
