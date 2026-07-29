package domain_test

import (
	"testing"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func TestParseEmail(t *testing.T) {
	t.Parallel()

	validCases := []string{
		"user@example.com",
		"ADMIN@CLINKS.TEST",
		"  john.doe@company.org  ",
	}

	for _, tc := range validCases {
		email, err := domain.ParseEmail(tc)
		if err != nil {
			t.Errorf("expected %q to be valid email, got error: %v", tc, err)
		}
		if email.Validate() != nil {
			t.Errorf("expected email.Validate() to pass for %q", email)
		}
	}

	invalidCases := []string{
		"",
		"not-an-email",
		"user@",
		"@domain.com",
		"user@ domain.com",
	}

	for _, tc := range invalidCases {
		_, err := domain.ParseEmail(tc)
		if err == nil {
			t.Errorf("expected %q to fail email parsing", tc)
		}
		if (domain.Email(tc)).Validate() == nil && tc != "" {
			t.Errorf("expected email.Validate() to fail for %q", tc)
		}
	}
}

func TestLocaleIsValid(t *testing.T) {
	t.Parallel()

	validLocales := []string{"de", "de-CH", "en-US", "fr-FR"}
	for _, loc := range validLocales {
		locale := domain.NewLocale(loc)
		if !locale.IsValid() {
			t.Errorf("expected locale %q to be valid", loc)
		}
	}

	invalidLocales := []string{"", "invalid_locale", "de-CH-Extra", "12-CH", "de-12"}
	for _, loc := range invalidLocales {
		locale := domain.Locale(loc)
		if locale.IsValid() {
			t.Errorf("expected locale %q to be invalid", loc)
		}
	}
}

func TestApplicationScope(t *testing.T) {
	t.Parallel()

	validScopes := []string{"", "shared", "admin", "planer_link", "infra_link"}
	for _, val := range validScopes {
		scope, err := domain.ParseApplicationScope(val)
		if err != nil {
			t.Errorf("expected scope %q to parse successfully, got: %v", val, err)
		}
		if !scope.IsValid() {
			t.Errorf("expected scope %v to be valid", scope)
		}
	}

	invalidScopes := []string{"custom_scope", "UNKNOWN"}
	for _, val := range invalidScopes {
		_, err := domain.ParseApplicationScope(val)
		if err == nil {
			t.Errorf("expected invalid scope %q to return error", val)
		}
	}
}

func TestRoleAndMembership(t *testing.T) {
	t.Parallel()

	if !domain.RoleSuperAdmin.IsSuperAdmin() {
		t.Error("expected RoleSuperAdmin.IsSuperAdmin() to be true")
	}
	if domain.RoleTenantAdmin.IsSuperAdmin() {
		t.Error("expected RoleTenantAdmin.IsSuperAdmin() to be false")
	}

	if !domain.RoleTenantAdmin.IsTenantRole() || !domain.RoleUser.IsTenantRole() {
		t.Error("expected tenant roles to return true for IsTenantRole()")
	}

	membership := &domain.Membership{
		Role:   domain.RoleTenantAdmin,
		Status: domain.MembershipActive,
	}
	if !membership.CanAdminister() {
		t.Error("expected active tenant admin membership to be able to administer")
	}

	membership.Status = "INACTIVE"
	if membership.CanAdminister() {
		t.Error("expected inactive membership to not be able to administer")
	}
}

func TestTenantID(t *testing.T) {
	t.Parallel()

	validID := domain.TenantID("t-12345")
	if !validID.IsValid() || validID.Validate() != nil {
		t.Errorf("expected valid TenantID %q", validID)
	}

	emptyID := domain.TenantID("  ")
	if emptyID.IsValid() || emptyID.Validate() == nil {
		t.Errorf("expected empty TenantID to fail validation")
	}
}
