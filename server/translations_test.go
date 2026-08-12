package clinks

import (
	"context"
	"testing"
)

type localizationCatalogStub struct {
	defaultLocale Locale
	translations  map[Locale][]Translation
}

func (stub localizationCatalogStub) ActiveLanguages(context.Context) ([]Language, error) {
	return nil, nil
}

func (stub localizationCatalogStub) AllLanguages(context.Context) ([]Language, error) {
	return nil, nil
}

func (stub localizationCatalogStub) DefaultLocale(context.Context) (Locale, error) {
	return stub.defaultLocale, nil
}

func (stub localizationCatalogStub) Translations(
	_ context.Context,
	locale Locale,
	_ ApplicationScope,
) ([]Translation, error) {
	return append([]Translation(nil), stub.translations[locale]...), nil
}

func (localizationCatalogStub) Message(context.Context, Locale, string) (string, error) {
	return "", nil
}

func (localizationCatalogStub) FallbackMessage() string { return "error.internal" }

func TestTranslationBundleUsesDefaultLanguageForMissingKeys(t *testing.T) {
	catalog := localizationCatalogStub{
		defaultLocale: "de-CH",
		translations: map[Locale][]Translation{
			"de-CH": {
				{Locale: "de-CH", ApplicationScope: ScopeShared, Key: "ui.sign_in", Value: "Anmelden"},
				{Locale: "de-CH", ApplicationScope: ScopeShared, Key: "ui.sign_out", Value: "Abmelden"},
			},
			"fr-CH": {
				{Locale: "fr-CH", ApplicationScope: ScopeShared, Key: "ui.sign_in", Value: "Se connecter"},
			},
		},
	}
	service := NewTranslations(catalog, catalog)

	bundle, err := service.TranslationBundle(t.Context(), "fr-CH", ScopePlanerLink)
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
	catalog := localizationCatalogStub{
		defaultLocale: "de-CH",
		translations: map[Locale][]Translation{
			"de-CH": {{Locale: "de-CH", ApplicationScope: ScopeShared, Key: "ui.sign_in", Value: "Anmelden"}},
		},
	}
	service := NewTranslations(catalog, catalog)

	bundle, err := service.TranslationBundle(t.Context(), "fr-CH", ScopePlanerLink)
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
