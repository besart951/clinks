package clinks

import (
	"context"
	"testing"
	"time"
)

const (
	testUserID   = UserID("018f22d3-7ea5-7f09-b2ca-1dce3c584001")
	testTenantID = TenantID("018f22d3-7ea5-7f09-b2ca-1dce3c584002")
	testRoleID   = RoleID("018f22d3-7ea5-7f09-b2ca-1dce3c584003")
)

type sessionIdentityStub struct {
	findByIDCalls int
	invalidated   UserID
	rotated       TenantID
	user          User
	hash          PasswordHash
	findErr       error
}

func (stub *sessionIdentityStub) FindByEmail(context.Context, Email) (User, PasswordHash, error) {
	return stub.user, stub.hash, stub.findErr
}

func (stub *sessionIdentityStub) FindByID(context.Context, UserID) (User, error) {
	stub.findByIDCalls++
	return User{}, NewError(ErrorInvalidCredentials)
}

func (stub *sessionIdentityStub) InvalidateSession(_ context.Context, userID UserID) error {
	stub.invalidated = userID
	return nil
}

func (stub *sessionIdentityStub) RotateTenantSession(
	_ context.Context,
	_ UserID,
	tenantID TenantID,
	_ string,
) (int, error) {
	stub.rotated = tenantID
	return 9, nil
}

type membershipReaderStub struct {
	membership Membership
	calls      int
	listCalls  int
}

func (stub *membershipReaderStub) MembershipsForUser(context.Context, UserID) ([]Membership, error) {
	stub.listCalls++
	return []Membership{stub.membership}, nil
}

func (stub *membershipReaderStub) FindActiveMembership(
	context.Context,
	UserID,
	TenantID,
) (Membership, error) {
	stub.calls++
	return stub.membership, nil
}

type sessionIssuerStub struct {
	claim SessionClaim
}

func (stub *sessionIssuerStub) Issue(claim SessionClaim) (string, error) {
	stub.claim = claim
	return "fresh-token", nil
}

func (*sessionIssuerStub) Verify(string) (SessionClaim, error) {
	return SessionClaim{}, NewError(ErrorInvalidCredentials)
}

type passwordStub struct {
	valid bool
	hash  PasswordHash
}

func (stub passwordStub) Hash(string) (PasswordHash, error) {
	return stub.hash, nil
}

func (stub passwordStub) Verify(string, PasswordHash) bool {
	return stub.valid
}

type auditStub struct {
	event AuditEvent
}

func (stub *auditStub) Append(_ context.Context, event AuditEvent) error {
	stub.event = event
	return nil
}

func TestAuthSwitchTenantUsesResolvedSession(t *testing.T) {
	identities := &sessionIdentityStub{}
	memberships := &membershipReaderStub{membership: Membership{
		Tenant: Tenant{ID: testTenantID, Name: "Tenant"},
		RoleID: testRoleID,
		Status: MembershipActive,
	}}
	issuer := &sessionIssuerStub{}
	auth := &Auth{identities: identities, memberships: memberships, sessions: issuer}

	session, err := auth.SwitchTenant(t.Context(), Session{
		User: User{ID: testUserID, GlobalRole: GlobalRoleUser, SessionVersion: 8},
	}, testTenantID)
	if err != nil {
		t.Fatalf("SwitchTenant() error = %v", err)
	}
	if identities.findByIDCalls != 0 {
		t.Fatalf("FindByID() calls = %d, want 0", identities.findByIDCalls)
	}
	if memberships.calls != 1 {
		t.Fatalf("FindActiveMembership() calls = %d, want 1", memberships.calls)
	}
	if identities.rotated != testTenantID {
		t.Fatalf("rotated tenant = %q, want %q", identities.rotated, testTenantID)
	}
	if session.Token != "fresh-token" || session.User.SessionVersion != 9 {
		t.Fatalf("switched session = %#v", session)
	}
	if issuer.claim.ActiveTenantID == nil || *issuer.claim.ActiveTenantID != testTenantID {
		t.Fatalf("issued active tenant = %v, want %q", issuer.claim.ActiveTenantID, testTenantID)
	}
}

func TestAuthLogoutUsesResolvedSession(t *testing.T) {
	identities := &sessionIdentityStub{}
	auth := &Auth{identities: identities}

	err := auth.Logout(t.Context(), Session{User: User{ID: testUserID}})
	if err != nil {
		t.Fatalf("Logout() error = %v", err)
	}
	if identities.findByIDCalls != 0 {
		t.Fatalf("FindByID() calls = %d, want 0", identities.findByIDCalls)
	}
	if identities.invalidated != testUserID {
		t.Fatalf("invalidated user = %q, want %q", identities.invalidated, testUserID)
	}
}

func TestAuthLoginReloadsMembershipAndIssuesSession(t *testing.T) {
	user := User{
		ID:             testUserID,
		Email:          "person@example.com",
		GlobalRole:     GlobalRoleUser,
		Locale:         "en-US",
		SessionVersion: 4,
	}
	identities := &sessionIdentityStub{user: user, hash: "stored-hash"}
	memberships := &membershipReaderStub{membership: Membership{
		Tenant: Tenant{ID: testTenantID, Name: "Tenant"},
		RoleID: testRoleID,
		Status: MembershipActive,
	}}
	issuer := &sessionIssuerStub{}
	audit := &auditStub{}
	auth := &Auth{
		identities:  identities,
		memberships: memberships,
		passwords:   passwordStub{valid: true},
		sessions:    issuer,
		audit:       audit,
		now:         func() time.Time { return time.Unix(100, 0) },
	}

	session, err := auth.Login(t.Context(), "person@example.com", "password")
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if session.Token != "fresh-token" || session.ActiveTenant == nil || session.ActiveTenant.ID != testTenantID {
		t.Fatalf("Login() session = %#v", session)
	}
	if memberships.listCalls != 1 {
		t.Fatalf("MembershipsForUser() calls = %d, want 1", memberships.listCalls)
	}
	if audit.event.Action != "session.login" || audit.event.ActorID == nil || *audit.event.ActorID != testUserID {
		t.Fatalf("audit event = %#v", audit.event)
	}
}
