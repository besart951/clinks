package clinks

import (
	"net/mail"
	"strings"
)

type Email string

func ParseEmail(value string) (Email, error) {
	normalized := strings.ToLower(
		strings.TrimSpace(value),
	)

	if normalized == "" {
		return "", NewError(ErrorValidation)
	}

	address, err := mail.ParseAddress(normalized)
	if err != nil || address.Address != normalized {
		return "", NewError(ErrorValidation)
	}

	return Email(normalized), nil
}

func (email Email) IsValid() bool {
	return email.Validate() == nil
}

func (email Email) Validate() error {
	_, err := ParseEmail(string(email))

	return err
}
