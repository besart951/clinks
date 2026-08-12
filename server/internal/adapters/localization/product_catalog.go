// Package localization provides the source-controlled product
// translation catalog combined with administrator-managed overrides.
package localization

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
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
	overrides ports.LocalizationOverrides
}

func NewProductCatalog(
	overrides ports.LocalizationOverrides,
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
		domain.ScopeShared,
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

func (catalog *ProductCatalog) ActiveLanguages(
	ctx context.Context,
) ([]domain.Language, error) {
	return catalog.overrides.ActiveLanguages(ctx)
}

func (catalog *ProductCatalog) AllLanguages(
	ctx context.Context,
) ([]domain.Language, error) {
	return catalog.overrides.AllLanguages(ctx)
}

func (*ProductCatalog) DefaultLocale(
	context.Context,
) (domain.Locale, error) {
	return productDefaultLocale, nil
}

func (*ProductCatalog) FallbackMessage() string {
	message, found := productMessage(
		productDefaultLocale,
		domain.ScopeShared,
		internalErrorMessageKey,
	)
	if !found {
		return internalErrorMessageKey
	}

	return message
}

func (catalog *ProductCatalog) Translations(
	ctx context.Context,
	locale domain.Locale,
	scope domain.ApplicationScope,
) ([]domain.Translation, error) {
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
	locale domain.Locale,
	key string,
) (string, error) {
	overrides, err := catalog.overrides.Translations(
		ctx,
		locale,
		domain.ScopeShared,
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
		domain.ScopeShared,
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
	locale domain.Locale,
	scope domain.ApplicationScope,
) []domain.Translation {
	byKey := make(
		map[string]domain.Translation,
	)

	// Shared translations form the baseline.
	for _, translation := range productTranslationEntries {
		if translation.Locale != locale ||
			translation.ApplicationScope != domain.ScopeShared {
			continue
		}

		byKey[translation.Key] = translation
	}

	// Scope-specific translations override shared translations
	// with the same key.
	if scope != domain.ScopeShared {
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
	locale domain.Locale,
	scope domain.ApplicationScope,
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

		case domain.ScopeShared:
			shared = translation.Value
		}
	}

	if shared != "" {
		return shared, true
	}

	return "", false
}

func translationMessage(
	translations []domain.Translation,
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
	overrides []domain.Translation,
) []domain.Translation {
	byKey := make(
		map[string]domain.Translation,
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
	byKey map[string]domain.Translation,
) []domain.Translation {
	translations := make(
		[]domain.Translation,
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
			right domain.Translation,
		) int {
			return cmp.Compare(
				left.Key,
				right.Key,
			)
		},
	)

	return translations
}
