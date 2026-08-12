// Package localization provides the source-controlled product
// translation catalog combined with administrator-managed overrides.
package localization

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"slices"

	clinks "github.com/besartmorina/clinks/server"
)

const internalErrorMessageKey = "error.internal"

var (
	ErrNilOverrides = errors.New(
		"localization overrides are required",
	)

	ErrTranslationNotFound = errors.New(
		"translation not found",
	)
)

type ProductCatalog struct {
	overrides overrideStore
}

func NewProductCatalog(
	overrides overrideStore,
) (*ProductCatalog, error) {
	if overrides == nil {
		return nil, ErrNilOverrides
	}

	if !productDefaultLocale.IsValid() {
		return nil, fmt.Errorf(
			"invalid product default locale %q",
			productDefaultLocale,
		)
	}

	if _, found := productMessage(
		productDefaultLocale,
		clinks.ScopeShared,
		internalErrorMessageKey,
	); !found {
		return nil, fmt.Errorf(
			"%w: required fallback %q for locale %q",
			ErrTranslationNotFound,
			internalErrorMessageKey,
			productDefaultLocale,
		)
	}

	return &ProductCatalog{
		overrides: overrides,
	}, nil
}

type overrideStore interface {
	ActiveLanguages(context.Context) ([]clinks.Language, error)
	AllLanguages(context.Context) ([]clinks.Language, error)
	Translations(context.Context, clinks.Locale, clinks.ApplicationScope) ([]clinks.Translation, error)
}

func (catalog *ProductCatalog) ActiveLanguages(
	ctx context.Context,
) ([]clinks.Language, error) {
	return catalog.overrides.ActiveLanguages(ctx)
}

func (catalog *ProductCatalog) AllLanguages(
	ctx context.Context,
) ([]clinks.Language, error) {
	return catalog.overrides.AllLanguages(ctx)
}

func (*ProductCatalog) DefaultLocale(
	context.Context,
) (clinks.Locale, error) {
	return productDefaultLocale, nil
}

func (*ProductCatalog) FallbackMessage() string {
	message, found := productMessage(
		productDefaultLocale,
		clinks.ScopeShared,
		internalErrorMessageKey,
	)
	if !found {
		return internalErrorMessageKey
	}

	return message
}

func (catalog *ProductCatalog) Translations(
	ctx context.Context,
	locale clinks.Locale,
	scope clinks.ApplicationScope,
) ([]clinks.Translation, error) {
	baseline := productTranslations(
		locale,
		scope,
	)

	overrides, err := catalog.overrides.Translations(
		ctx,
		locale,
		scope,
	)
	if err != nil {
		return nil, fmt.Errorf(
			"load translation overrides: %w",
			err,
		)
	}

	return mergeTranslations(
		baseline,
		overrides,
	), nil
}

func (catalog *ProductCatalog) Message(
	ctx context.Context,
	locale clinks.Locale,
	key string,
) (string, error) {
	overrides, err := catalog.overrides.Translations(
		ctx,
		locale,
		clinks.ScopeShared,
	)
	if err != nil {
		return "", fmt.Errorf(
			"load translation overrides: %w",
			err,
		)
	}

	if message, found := translationMessage(
		overrides,
		key,
	); found {
		return message, nil
	}

	if message, found := productMessage(
		locale,
		clinks.ScopeShared,
		key,
	); found {
		return message, nil
	}

	return "", fmt.Errorf(
		"%w: locale=%q key=%q",
		ErrTranslationNotFound,
		locale,
		key,
	)
}

func productTranslations(
	locale clinks.Locale,
	scope clinks.ApplicationScope,
) []clinks.Translation {
	byKey := make(
		map[string]clinks.Translation,
	)

	// Shared translations form the baseline.
	for _, translation := range productTranslationEntries {
		if translation.Locale != locale ||
			translation.ApplicationScope != clinks.ScopeShared {
			continue
		}

		byKey[translation.Key] = translation
	}

	// Scope-specific translations override shared translations
	// with the same key.
	if scope != clinks.ScopeShared {
		for _, translation := range productTranslationEntries {
			if translation.Locale != locale ||
				translation.ApplicationScope != scope {
				continue
			}

			byKey[translation.Key] = translation
		}
	}

	return sortedTranslations(byKey)
}

func productMessage(
	locale clinks.Locale,
	scope clinks.ApplicationScope,
	key string,
) (string, bool) {
	var shared string

	for _, translation := range productTranslationEntries {
		if translation.Locale != locale ||
			translation.Key != key {
			continue
		}

		switch translation.ApplicationScope {
		case scope:
			return translation.Value, true

		case clinks.ScopeShared:
			shared = translation.Value
		}
	}

	if shared != "" {
		return shared, true
	}

	return "", false
}

func translationMessage(
	translations []clinks.Translation,
	key string,
) (string, bool) {
	for _, translation := range translations {
		if translation.Key == key {
			return translation.Value, true
		}
	}

	return "", false
}

func mergeTranslations(
	baseline,
	overrides []clinks.Translation,
) []clinks.Translation {
	byKey := make(
		map[string]clinks.Translation,
		len(baseline)+len(overrides),
	)

	for _, translation := range baseline {
		byKey[translation.Key] = translation
	}

	for _, translation := range overrides {
		byKey[translation.Key] = translation
	}

	return sortedTranslations(byKey)
}

func sortedTranslations(
	byKey map[string]clinks.Translation,
) []clinks.Translation {
	translations := make(
		[]clinks.Translation,
		0,
		len(byKey),
	)

	for _, translation := range byKey {
		translations = append(
			translations,
			translation,
		)
	}

	slices.SortFunc(
		translations,
		func(
			left,
			right clinks.Translation,
		) int {
			return cmp.Compare(
				left.Key,
				right.Key,
			)
		},
	)

	return translations
}
