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

func NewTranslator(catalog ports.LocalizationCatalog) *Translator {
	return &Translator{catalog: catalog}
}

func (translator *Translator) AuditDescription(
	ctx context.Context,
	locale domain.Locale,
	event *domain.AuditEvent,
) string {
	if event == nil {
		return ""
	}

	key := "audit." + event.Action
	message, err := translator.resolveMessage(ctx, locale, key)
	if err != nil {
		if event.Target != "" {
			return event.Action + ": " + event.Target
		}
		return event.Action
	}

	return strings.ReplaceAll(message, "{target}", event.Target)
}

func (translator *Translator) ErrorMessage(
	ctx context.Context,
	locale domain.Locale,
	err error,
) string {
	if err == nil {
		return ""
	}

	key := errorKey(err)
	if message, resolveErr := translator.resolveMessage(ctx, locale, key); resolveErr == nil {
		return message
	}

	if translator.catalog != nil {
		return translator.catalog.FallbackMessage()
	}
	return "error.internal"
}

func (translator *Translator) resolveMessage(
	ctx context.Context,
	locale domain.Locale,
	key string,
) (string, error) {
	if translator.catalog == nil {
		return "", errors.New("localization catalog is nil")
	}

	message, err := translator.catalog.Message(ctx, locale, key)
	if err == nil {
		return message, nil
	}

	defaultLocale, defaultErr := translator.catalog.DefaultLocale(ctx)
	if defaultErr == nil && defaultLocale != locale {
		return translator.catalog.Message(ctx, defaultLocale, key)
	}

	return "", err
}

func errorKey(err error) string {
	var domainError *domain.Error
	if errors.As(err, &domainError) && domainError.Kind != "" {
		return "error." + string(domainError.Kind)
	}
	return "error.internal"
}
