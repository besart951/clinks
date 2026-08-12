package domain

import "strings"

type (
	Locale           string
	ApplicationScope string
)

const (
	ScopeShared     ApplicationScope = "shared"
	ScopeAdmin      ApplicationScope = "admin"
	ScopePlanerLink ApplicationScope = "planer_link"
	ScopeInfraLink  ApplicationScope = "infra_link"
)

type Language struct {
	Code      Locale
	Name      string
	IsDefault bool
	IsActive  bool
}

type Translation struct {
	Locale           Locale
	ApplicationScope ApplicationScope
	Key              string
	Value            string
}

type TranslationBundle struct {
	Locale       Locale
	Translations []Translation
}

func NewLocale(value string) Locale {
	value = strings.TrimSpace(value)

	language, region, hasRegion := strings.Cut(value, "-")

	language = strings.ToLower(language)

	if !hasRegion {
		return Locale(language)
	}

	return Locale(
		language +
			"-" +
			strings.ToUpper(region),
	)
}

func ParseLocale(value string) (Locale, error) {
	locale := NewLocale(value)

	if !locale.IsValid() {
		return "", NewError(ErrorValidation)
	}

	return locale, nil
}

func (locale Locale) IsValid() bool {
	language, region, hasRegion := strings.Cut(
		string(locale),
		"-",
	)

	if !lowerASCIILetters(language, 2, 3) {
		return false
	}

	if !hasRegion {
		return true
	}

	return upperASCIILetters(region, 2)
}

func ParseApplicationScope(
	value string,
) (ApplicationScope, error) {
	value = strings.ToLower(
		strings.TrimSpace(value),
	)

	if value == "" {
		return ScopeShared, nil
	}

	scope := ApplicationScope(value)

	if !scope.IsValid() {
		return "", NewError(ErrorValidation)
	}

	return scope, nil
}

func (scope ApplicationScope) IsValid() bool {
	switch scope {
	case ScopeShared,
		ScopeAdmin,
		ScopePlanerLink,
		ScopeInfraLink:
		return true

	default:
		return false
	}
}

func lowerASCIILetters(
	value string,
	minimumLength,
	maximumLength int,
) bool {
	if len(value) < minimumLength ||
		len(value) > maximumLength {
		return false
	}

	for _, character := range value {
		if character < 'a' ||
			character > 'z' {
			return false
		}
	}

	return true
}

func upperASCIILetters(
	value string,
	length int,
) bool {
	if len(value) != length {
		return false
	}

	for _, character := range value {
		if character < 'A' ||
			character > 'Z' {
			return false
		}
	}

	return true
}
