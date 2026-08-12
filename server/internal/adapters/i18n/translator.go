// Package i18n adapts domain errors and audit events into localized
// presentation messages.
package i18n

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

const (
	errorMessagePrefix      = "error."
	auditMessagePrefix      = "audit."
	internalErrorMessageKey = "error.internal"
	auditTargetPlaceholder  = "{target}"
)

type Translator struct {
	catalog ports.LocalizationCatalog
}

func NewTranslator(
	catalog ports.LocalizationCatalog,
) (*Translator, error) {
	if catalog == nil {
		return nil, errors.New(
			"i18n translator: localization catalog is required",
		)
	}

	return &Translator{
		catalog: catalog,
	}, nil
}

func (translator *Translator) AuditDescription(
	ctx context.Context,
	locale domain.Locale,
	event domain.AuditEvent,
) string {
	key := auditMessagePrefix + event.Action

	message, err := translator.resolveMessage(
		ctx,
		locale,
		key,
	)
	if err != nil {
		return auditFallback(event)
	}

	return strings.ReplaceAll(
		message,
		auditTargetPlaceholder,
		event.Target,
	)
}

func (translator *Translator) ErrorMessage(
	ctx context.Context,
	locale domain.Locale,
	err error,
) string {
	if err == nil {
		return ""
	}

	message, resolveErr := translator.resolveMessage(
		ctx,
		locale,
		errorKey(err),
	)
	if resolveErr == nil {
		return message
	}

	fallback := strings.TrimSpace(
		translator.catalog.FallbackMessage(),
	)
	if fallback != "" {
		return fallback
	}

	return internalErrorMessageKey
}

func (translator *Translator) resolveMessage(
	ctx context.Context,
	locale domain.Locale,
	key string,
) (string, error) {
	message, err := translator.catalog.Message(
		ctx,
		locale,
		key,
	)
	if err == nil {
		return message, nil
	}

	defaultLocale, defaultErr :=
		translator.catalog.DefaultLocale(ctx)
	if defaultErr != nil {
		return "", errors.Join(
			err,
			fmt.Errorf(
				"resolve default locale: %w",
				defaultErr,
			),
		)
	}

	if defaultLocale == locale {
		return "", err
	}

	fallback, fallbackErr := translator.catalog.Message(
		ctx,
		defaultLocale,
		key,
	)
	if fallbackErr != nil {
		return "", errors.Join(
			err,
			fmt.Errorf(
				"resolve fallback message: %w",
				fallbackErr,
			),
		)
	}

	return fallback, nil
}

func errorKey(err error) string {
	domainError, ok := errors.AsType[*domain.Error](err)
	if !ok ||
		domainError == nil ||
		!domainError.Kind.IsValid() {
		return internalErrorMessageKey
	}

	return errorMessagePrefix +
		string(domainError.Kind)
}

func auditFallback(event domain.AuditEvent) string {
	if event.Target == "" {
		return event.Action
	}

	return event.Action + ": " + event.Target
}
