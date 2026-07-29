package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type identityStub struct {
	user       domain.User
	hash       domain.PasswordHash
	lookupErr  error
	current    domain.User
	currentErr error
}

func (stub *identityStub) EnsureSuperAdmin(context.Context, domain.SuperAdminBootstrap) error {
	return nil
}

func (stub *identityStub) FindByEmail(context.Context, domain.Email) (domain.User, domain.PasswordHash, error) {
	return stub.user, stub.hash, stub.lookupErr
}

func (stub *identityStub) FindByID(context.Context, domain.UserID) (domain.User, error) {
	return stub.current, stub.currentErr
}
func (*identityStub) InvalidateSession(context.Context, domain.User) error { return nil }

type provisionerStub struct{}

func (provisionerStub) CreateTenantOwner(context.Context, domain.TenantOwnerRegistration) (domain.Session, error) {
	return domain.Session{}, nil
}

type membershipStub struct{}

func (membershipStub) MembershipsForUser(context.Context, domain.UserID) ([]domain.Membership, error) {
	return nil, nil
}

func (membershipStub) FindActiveMembership(context.Context, domain.UserID, domain.TenantID) (domain.Membership, error) {
	return domain.Membership{}, nil
}

func (membershipStub) CreateInvitation(context.Context, *domain.Invitation) (domain.Invitation, error) {
	return domain.Invitation{}, nil
}

func (membershipStub) FindInvitation(context.Context, domain.InvitationHash) (domain.Invitation, error) {
	return domain.Invitation{}, nil
}

func (membershipStub) AcceptInvitation(context.Context, *domain.InvitationAcceptance) (domain.User, domain.Membership, error) {
	return domain.User{}, domain.Membership{}, nil
}

type passwordHasherStub struct {
	verifiedHash domain.PasswordHash
	verified     bool
}

func (stub *passwordHasherStub) Hash(string) (domain.PasswordHash, error) { return "hash", nil }
func (stub *passwordHasherStub) Verify(_ string, hash domain.PasswordHash) bool {
	stub.verifiedHash = hash
	return stub.verified
}

type sessionIssuerStub struct{ claim domain.SessionClaim }

func (*sessionIssuerStub) Issue(*domain.SessionClaim) (string, error) { return "token", nil }

func (stub *sessionIssuerStub) Verify(string) (domain.SessionClaim, error) { return stub.claim, nil }

type auditStub struct{}

func (auditStub) Append(context.Context, *domain.AuditEvent) error { return nil }
func (auditStub) List(context.Context, *domain.AuditFilter) (domain.AuditPage, error) {
	return domain.AuditPage{}, nil
}

type mailerStub struct{}

func (mailerStub) Send(context.Context, *domain.Invitation) (string, error) { return "sent", nil }

func newTestAuth(identity *identityStub, passwords *passwordHasherStub, issuer *sessionIssuerStub) *AuthService {
	return NewAuthService(&AuthDependencies{
		Identities: identity, Provisioner: provisionerStub{}, Memberships: membershipStub{}, Passwords: passwords,
		Sessions: issuer, Audit: auditStub{}, Mailer: mailerStub{}, InviteBaseURL: "https://app.example", InviteTTL: time.Hour,
	})
}

func TestLoginComparesUnknownEmailAgainstRejectedHash(t *testing.T) {
	passwords := &passwordHasherStub{}
	service := newTestAuth(&identityStub{lookupErr: errors.New("not found")}, passwords, &sessionIssuerStub{})
	_, err := service.Login(context.Background(), "user@example.com", "correct horse battery staple")
	if !isDomainError(err, domain.ErrorInvalidCredentials) {
		t.Fatalf("expected invalid credentials, got %v", err)
	}
	if passwords.verifiedHash != "" {
		t.Fatalf("expected rejected hash, got %q", passwords.verifiedHash)
	}
}

func TestCurrentSessionRejectsStaleSession(t *testing.T) {
	claimed := domain.User{ID: "user-1", Role: domain.RoleSuperAdmin, SessionVersion: 1}
	current := claimed
	current.SessionVersion = 2
	service := newTestAuth(&identityStub{current: current}, &passwordHasherStub{}, &sessionIssuerStub{claim: domain.SessionClaim{User: claimed}})
	_, err := service.CurrentSession(context.Background(), "token")
	if !isDomainError(err, domain.ErrorUnauthorized) {
		t.Fatalf("expected unauthorized, got %v", err)
	}
}

func isDomainError(err error, kind domain.ErrorKind) bool {
	var domainError *domain.Error
	return errors.As(err, &domainError) && domainError.Kind == kind
}
