package clinks

import (
	"context"
	"errors"
	"testing"
)

type membershipManagerStub struct {
	membership Membership
}

func (stub membershipManagerStub) FindActiveMembership(context.Context, UserID, TenantID) (Membership, error) {
	return stub.membership, nil
}

func (membershipManagerStub) ListMemberships(context.Context, TenantID, MembershipFilter) (Page[Membership], error) {
	return Page[Membership]{}, nil
}

func (membershipManagerStub) UpdateMembership(context.Context, Membership, UserID) (Membership, error) {
	return Membership{}, nil
}

type roleStoreStub struct {
	permissions []Permission
	created     bool
}

func (stub *roleStoreStub) ListRoles(context.Context, TenantID, RoleFilter) (Page[Role], error) {
	return Page[Role]{}, nil
}

func (stub *roleStoreStub) FindRole(context.Context, TenantID, RoleID) (Role, error) {
	return Role{}, nil
}

func (stub *roleStoreStub) PermissionsForRole(context.Context, TenantID, RoleID) ([]Permission, error) {
	return stub.permissions, nil
}

func (stub *roleStoreStub) CreateRole(_ context.Context, role Role, _ UserID) (Role, error) {
	stub.created = true
	return role, nil
}

func (*roleStoreStub) UpdateRole(context.Context, Role, UserID) (Role, error) {
	return Role{}, nil
}

func (*roleStoreStub) DeleteRole(context.Context, TenantID, RoleID, uint64, UserID) error {
	return nil
}

func TestTenantAccessRejectsMissingPermissionBeforeWrite(t *testing.T) {
	roles := &roleStoreStub{}
	access := &TenantAccess{
		memberships: membershipManagerStub{membership: Membership{RoleID: testRoleID}},
		roles:       roles,
	}
	session := Session{
		User:         User{ID: testUserID},
		ActiveTenant: &Tenant{ID: testTenantID},
	}

	_, err := access.CreateRole(t.Context(), session, "Operators", []Permission{PermissionUserRead})
	if !errors.Is(err, NewError(ErrorUnauthorized)) {
		t.Fatalf("CreateRole() error = %v, want unauthorized", err)
	}
	if roles.created {
		t.Fatal("CreateRole() wrote a role without permission")
	}
}
