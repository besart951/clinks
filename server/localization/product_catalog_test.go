package localization

import (
	"context"
	"testing"

	clinks "github.com/besartmorina/clinks/server"
)

type overrideStub struct {
	translations []clinks.Translation
}

func (stub overrideStub) ActiveLanguages(context.Context) ([]clinks.Language, error) { return nil, nil }
func (stub overrideStub) AllLanguages(context.Context) ([]clinks.Language, error)    { return nil, nil }
func (stub overrideStub) Translations(context.Context, clinks.Locale, clinks.ApplicationScope) ([]clinks.Translation, error) {
	return append([]clinks.Translation(nil), stub.translations...), nil
}

func TestProductCatalogUsesGermanSourceTextByDefault(t *testing.T) {
	catalog, err := NewProductCatalog(overrideStub{})
	if err != nil {
		t.Fatal(err)
	}

	translations, err := catalog.Translations(t.Context(), "de-CH", clinks.ScopeShared)
	if err != nil {
		t.Fatal(err)
	}
	if signInTranslationValue(translations) != "Anmelden" {
		t.Fatalf("got %q", signInTranslationValue(translations))
	}
	defaultLocale, err := catalog.DefaultLocale(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if defaultLocale != "de-CH" {
		t.Fatalf("got default locale %q", defaultLocale)
	}
}

func TestProductCatalogLetsAnAdministratorOverrideSourceText(t *testing.T) {
	catalog, err := NewProductCatalog(overrideStub{translations: []clinks.Translation{
		{Locale: "de-CH", ApplicationScope: clinks.ScopeShared, Key: "ui.sign_in", Value: "Einloggen"},
	}})
	if err != nil {
		t.Fatal(err)
	}

	translations, err := catalog.Translations(t.Context(), "de-CH", clinks.ScopeShared)
	if err != nil {
		t.Fatal(err)
	}
	if signInTranslationValue(translations) != "Einloggen" {
		t.Fatalf("got %q", signInTranslationValue(translations))
	}
}

func signInTranslationValue(translations []clinks.Translation) string {
	for _, translation := range translations {
		if translation.Key == "ui.sign_in" {
			return translation.Value
		}
	}
	return ""
}
