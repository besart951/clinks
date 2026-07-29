package localization

import (
	"context"
	"testing"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type overrideStub struct {
	translations []domain.Translation
}

func (stub overrideStub) ActiveLanguages(context.Context) ([]domain.Language, error) { return nil, nil }
func (stub overrideStub) AllLanguages(context.Context) ([]domain.Language, error)    { return nil, nil }
func (stub overrideStub) Translations(context.Context, domain.Locale, domain.ApplicationScope) ([]domain.Translation, error) {
	return append([]domain.Translation(nil), stub.translations...), nil
}

func TestProductCatalogUsesGermanSourceTextByDefault(t *testing.T) {
	catalog := NewProductCatalog(overrideStub{})

	translations, err := catalog.Translations(context.Background(), "de-CH", domain.ScopeShared)
	if err != nil {
		t.Fatal(err)
	}
	if signInTranslationValue(translations) != "Anmelden" {
		t.Fatalf("got %q", signInTranslationValue(translations))
	}
	defaultLocale, err := catalog.DefaultLocale(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if defaultLocale != "de-CH" {
		t.Fatalf("got default locale %q", defaultLocale)
	}
}

func TestProductCatalogLetsAnAdministratorOverrideSourceText(t *testing.T) {
	catalog := NewProductCatalog(overrideStub{translations: []domain.Translation{
		{Locale: "de-CH", ApplicationScope: domain.ScopeShared, Key: "ui.sign_in", Value: "Einloggen"},
	}})

	translations, err := catalog.Translations(context.Background(), "de-CH", domain.ScopeShared)
	if err != nil {
		t.Fatal(err)
	}
	if signInTranslationValue(translations) != "Einloggen" {
		t.Fatalf("got %q", signInTranslationValue(translations))
	}
}

func signInTranslationValue(translations []domain.Translation) string {
	for _, translation := range translations {
		if translation.Key == "ui.sign_in" {
			return translation.Value
		}
	}
	return ""
}
