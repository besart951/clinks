package clinks

import (
	"strings"
	"unicode/utf8"
)

const (
	MinimumPasswordRunes         = 12
	MaximumPasswordBytes         = 72
	MaximumSearchRunes           = 200
	MaximumTranslationKeyRunes   = 255
	MaximumTranslationValueBytes = 16 * 1024
)

func ValidatePassword(password string) error {
	if !utf8.ValidString(password) ||
		utf8.RuneCountInString(password) < MinimumPasswordRunes ||
		len(password) > MaximumPasswordBytes {
		return NewError(ErrorValidation)
	}
	return nil
}

func NormalizeTenantName(name string) (string, error) {
	return normalizeName(name, 2, 120)
}

func NormalizeRoleName(name string) (string, error) {
	return normalizeName(name, 2, 80)
}

func NormalizeSearch(search string) (string, error) {
	search = strings.TrimSpace(search)
	if !utf8.ValidString(search) || utf8.RuneCountInString(search) > MaximumSearchRunes {
		return "", NewError(ErrorValidation)
	}
	return search, nil
}

func ValidateTranslation(key, value string) error {
	key = strings.TrimSpace(key)
	if key == "" ||
		!utf8.ValidString(key) ||
		utf8.RuneCountInString(key) > MaximumTranslationKeyRunes ||
		!utf8.ValidString(value) ||
		len(value) > MaximumTranslationValueBytes {
		return NewError(ErrorValidation)
	}
	return nil
}

func validUUID(value string) bool {
	if len(value) != 36 ||
		value[8] != '-' ||
		value[13] != '-' ||
		value[18] != '-' ||
		value[23] != '-' {
		return false
	}

	nonzero := false
	for index, character := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			continue
		}
		if character < '0' || character > '9' {
			if character < 'a' || character > 'f' {
				return false
			}
		}
		if character != '0' {
			nonzero = true
		}
	}

	return nonzero
}

func normalizeName(name string, minimumRunes, maximumRunes int) (string, error) {
	name = strings.TrimSpace(name)
	runes := utf8.RuneCountInString(name)
	if !utf8.ValidString(name) || runes < minimumRunes || runes > maximumRunes {
		return "", NewError(ErrorValidation)
	}
	return name, nil
}
