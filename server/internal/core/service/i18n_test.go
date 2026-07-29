package service

import (
	"context"
	"testing"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type localizationCatalogStub struct {
	defaultLocale domain.Locale
	translations  map[domain.Locale][]domain.Translation
}

func (stub localizationCatalogStub) ActiveLanguages(context.Context) ([]domain.Language, error) {
	return nil, nil
}

func (stub localizationCatalogStub) AllLanguages(context.Context) ([]domain.Language, error) {
	return nil, nil
}

func (stub localizationCatalogStub) DefaultLocale(context.Context) (domain.Locale, error) {
	return stub.defaultLocale, nil
}

func (stub localizationCatalogStub) Translations(
	_ context.Context,
	locale domain.Locale,
	_ domain.ApplicationScope,
) ([]domain.Translation, error) {
	return append([]domain.Translation(nil), stub.translations[locale]...), nil
}

func (localizationCatalogStub) Message(context.Context, domain.Locale, string) (string, error) {
	return "", nil
}

func (localizationCatalogStub) FallbackMessage() string { return "error.internal" }

func TestTranslationBundleUsesDefaultLanguageForMissingKeys(t *testing.T) {
	service := NewI18nService(localizationCatalogStub{
		defaultLocale: "de-CH",
		translations: map[domain.Locale][]domain.Translation{
			"de-CH": {
				{Locale: "de-CH", ApplicationScope: domain.ScopeShared, Key: "ui.sign_in", Value: "Anmelden"},
				{Locale: "de-CH", ApplicationScope: domain.ScopeShared, Key: "ui.sign_out", Value: "Abmelden"},
			},
			"fr-CH": {
				{Locale: "fr-CH", ApplicationScope: domain.ScopeShared, Key: "ui.sign_in", Value: "Se connecter"},
			},
		},
	})

	bundle, err := service.TranslationBundle(context.Background(), "fr-CH", domain.ScopePlanerLink)
	if err != nil {
		t.Fatal(err)
	}
	if bundle.Locale != "fr-CH" {
		t.Fatalf("got locale %q", bundle.Locale)
	}
	translations := make(map[string]string, len(bundle.Translations))
	for _, translation := range bundle.Translations {
		translations[translation.Key] = translation.Value
	}
	if translations["ui.sign_in"] != "Se connecter" {
		t.Fatalf("got sign-in translation %q", translations["ui.sign_in"])
	}
	if translations["ui.sign_out"] != "Abmelden" {
		t.Fatalf("got sign-out translation %q", translations["ui.sign_out"])
	}
}

func TestTranslationBundleFallsBackToDefaultLanguageWhenRequestedLanguageIsEmpty(t *testing.T) {
	service := NewI18nService(localizationCatalogStub{
		defaultLocale: "de-CH",
		translations: map[domain.Locale][]domain.Translation{
			"de-CH": {{Locale: "de-CH", ApplicationScope: domain.ScopeShared, Key: "ui.sign_in", Value: "Anmelden"}},
		},
	})

	bundle, err := service.TranslationBundle(context.Background(), "fr-CH", domain.ScopePlanerLink)
	if err != nil {
		t.Fatal(err)
	}
	if bundle.Locale != "de-CH" {
		t.Fatalf("got locale %q", bundle.Locale)
	}
	if len(bundle.Translations) != 1 || bundle.Translations[0].Value != "Anmelden" {
		t.Fatalf("got translations %#v", bundle.Translations)
	}
}
