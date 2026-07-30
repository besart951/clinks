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
	return Locale(strings.TrimSpace(value))
}

func ParseApplicationScope(value string) (ApplicationScope, error) {
	scope := ApplicationScope(strings.TrimSpace(value))
	if scope == "" {
		return ScopeShared, nil
	}
	if !scope.IsValid() {
		return "", NewError(ErrorValidation)
	}
	return scope, nil
}

func (locale Locale) IsValid() bool {
	parts := strings.Split(string(locale), "-")
	if len(parts) < 1 || len(parts) > 2 || !letters(parts[0], 'a', 'z', 2, 3) {
		return false
	}
	return len(parts) == 1 || letters(parts[1], 'A', 'Z', 2, 2)
}

func (scope ApplicationScope) IsValid() bool {
	return scope == ScopeShared || scope == ScopeAdmin || scope == ScopePlanerLink || scope == ScopeInfraLink
}

func letters(value string, minimum, maximum rune, minimumLength, maximumLength int) bool {
	if len(value) < minimumLength || len(value) > maximumLength {
		return false
	}
	for _, character := range value {
		if character < minimum || character > maximum {
			return false
		}
	}
	return true
}
