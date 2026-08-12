package clinks

import (
	"context"
	"testing"
	"time"
)

type invitationStoreStub struct {
	invitation Invitation
	acceptance PasswordInvitationAcceptance
	user       User
	membership Membership
}

func (stub *invitationStoreStub) CreateInvitation(_ context.Context, invitation Invitation) (Invitation, error) {
	return invitation, nil
}

func (stub *invitationStoreStub) FindInvitation(context.Context, InvitationHash) (Invitation, error) {
	return stub.invitation, nil
}

func (stub *invitationStoreStub) AcceptInvitation(
	_ context.Context,
	acceptance PasswordInvitationAcceptance,
) (User, Membership, error) {
	stub.acceptance = acceptance
	return stub.user, stub.membership, nil
}

func (*invitationStoreStub) AcceptExternalInvitation(
	context.Context,
	ExternalInvitationAcceptance,
) (User, Membership, error) {
	return User{}, Membership{}, nil
}

func TestAuthAcceptInvitationCreatesUserAndSession(t *testing.T) {
	email := Email("invitee@example.com")
	store := &invitationStoreStub{
		invitation: Invitation{
			ID:        InvitationID("018f22d3-7ea5-7f09-b2ca-1dce3c584004"),
			TenantID:  testTenantID,
			Email:     email,
			RoleID:    testRoleID,
			ExpiresAt: time.Unix(200, 0),
		},
		user: User{
			ID:             testUserID,
			Email:          email,
			GlobalRole:     GlobalRoleUser,
			Locale:         "en-US",
			SessionVersion: 1,
		},
		membership: Membership{
			ID:     MembershipID("018f22d3-7ea5-7f09-b2ca-1dce3c584005"),
			Tenant: Tenant{ID: testTenantID, Name: "Tenant"},
			RoleID: testRoleID,
			Status: MembershipActive,
		},
	}
	auth := &Auth{
		identities:  &sessionIdentityStub{findErr: NewError(ErrorInvalidCredentials)},
		invitations: store,
		passwords:   passwordStub{hash: "new-hash"},
		sessions:    &sessionIssuerStub{},
		now:         func() time.Time { return time.Unix(100, 0) },
	}

	session, err := auth.AcceptInvitation(
		t.Context(),
		"raw-invitation-token",
		string(email),
		"StrongPassword123!",
		"en-US",
	)
	if err != nil {
		t.Fatalf("AcceptInvitation() error = %v", err)
	}
	if store.acceptance.ExistingUser {
		t.Fatal("AcceptInvitation() marked a new user as existing")
	}
	if store.acceptance.PasswordHash != "new-hash" {
		t.Fatalf("password hash = %q, want new-hash", store.acceptance.PasswordHash)
	}
	if session.Token != "fresh-token" || session.ActiveTenant == nil || session.ActiveTenant.ID != testTenantID {
		t.Fatalf("accepted session = %#v", session)
	}
}
