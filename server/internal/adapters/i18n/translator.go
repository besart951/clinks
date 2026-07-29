// Package i18n adapts localized messages for HTTP responses.
package i18n

import (
	"context"
	"errors"
	"strings"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type Translator struct {
	catalog ports.LocalizationCatalog
}

func (translator *Translator) AuditDescription(
	ctx context.Context,
	locale domain.Locale,
	event *domain.AuditEvent,
) string {
	key := "audit." + event.Action
	message, err := translator.catalog.Message(ctx, locale, key)
	if err != nil {
		defaultLocale, defaultErr := translator.catalog.DefaultLocale(ctx)
		if defaultErr == nil {
			message, err = translator.catalog.Message(ctx, defaultLocale, key)
		}
	}
	if err != nil {
		return event.Action + ": " + event.Target
	}
	return strings.ReplaceAll(message, "{target}", event.Target)
}

func NewTranslator(catalog ports.LocalizationCatalog) *Translator {
	return &Translator{catalog: catalog}
}

func (translator *Translator) ErrorMessage(
	ctx context.Context,
	locale domain.Locale,
	err error,
) string {
	key := errorKey(err)
	if message, lookupErr := translator.catalog.Message(ctx, locale, key); lookupErr == nil {
		return message
	}
	defaultLocale, defaultErr := translator.catalog.DefaultLocale(ctx)
	if defaultErr == nil && defaultLocale != locale {
		if message, lookupErr := translator.catalog.Message(ctx, defaultLocale, key); lookupErr == nil {
			return message
		}
	}
	return translator.catalog.FallbackMessage()
}

func errorKey(err error) string {
	var domainError *domain.Error
	if errors.As(err, &domainError) {
		return "error." + string(domainError.Kind)
	}
	return "error.internal"
}
