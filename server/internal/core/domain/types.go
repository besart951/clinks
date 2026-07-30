// Package domain contains dependency-free business entities and value types.
package domain

import (
	"net/mail"
	"strings"
)

type Email string

func ParseEmail(value string) (Email, error) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	parsed, err := mail.ParseAddress(normalized)
	if err != nil || parsed.Address != normalized {
		return "", NewError(ErrorValidation)
	}
	return Email(normalized), nil
}

func (email Email) Validate() error {
	_, err := ParseEmail(string(email))
	return err
}
