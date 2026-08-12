package postgres

import (
	"testing"

	clinks "github.com/besartmorina/clinks/server"
)

func TestRemovesAdministrator(t *testing.T) {
	tests := []struct {
		name    string
		status  clinks.MembershipStatus
		current clinks.RoleKind
		target  clinks.RoleKind
		want    bool
	}{
		{"deactivate administrator", clinks.MembershipInactive, clinks.RoleKindAdministrator, clinks.RoleKindAdministrator, true},
		{"change administrator role", clinks.MembershipActive, clinks.RoleKindAdministrator, clinks.RoleKindUser, true},
		{"keep administrator", clinks.MembershipActive, clinks.RoleKindAdministrator, clinks.RoleKindAdministrator, false},
		{"change regular user", clinks.MembershipActive, clinks.RoleKindUser, clinks.RoleKindCustom, false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := removesAdministrator(test.status, test.current, test.target); got != test.want {
				t.Fatalf("removesAdministrator() = %t, want %t", got, test.want)
			}
		})
	}
}
