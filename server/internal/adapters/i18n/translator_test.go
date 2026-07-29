package i18n

import (
	"context"
	"errors"
	"testing"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type catalogStub struct {
	messages      map[domain.Locale]map[string]string
	defaultLocale domain.Locale
}

func (stub catalogStub) ActiveLanguages(context.Context) ([]domain.Language, error) { return nil, nil }
func (stub catalogStub) AllLanguages(context.Context) ([]domain.Language, error)    { return nil, nil }
func (stub catalogStub) DefaultLocale(context.Context) (domain.Locale, error) {
	return stub.defaultLocale, nil
}

func (stub catalogStub) Translations(context.Context, domain.Locale, domain.ApplicationScope) ([]domain.Translation, error) {
	return nil, nil
}

func (stub catalogStub) Message(_ context.Context, locale domain.Locale, key string) (string, error) {
	if message := stub.messages[locale][key]; message != "" {
		return message, nil
	}
	return "", errors.New("translation missing")
}

func (catalogStub) FallbackMessage() string { return "error.internal" }

func TestTranslatorFallsBackToDefaultLocale(t *testing.T) {
	credentialErrorKey := "error." + string(domain.ErrorInvalidCredentials)
	translator := NewTranslator(catalogStub{
		defaultLocale: "de-CH",
		messages: map[domain.Locale]map[string]string{
			"de-CH": {credentialErrorKey: "E-Mail oder Passwort ist ungültig."}, // #nosec G101 -- localized public test response, not a credential.
		},
	})

	message := translator.ErrorMessage(
		context.Background(), "fr-CH", domain.NewError(domain.ErrorInvalidCredentials),
	)
	if message != "E-Mail oder Passwort ist ungültig." {
		t.Fatalf("got %q", message)
	}
}
