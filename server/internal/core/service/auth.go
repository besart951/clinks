// Package service implements the application's use cases.
package service

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type AuthService struct {
	identities    ports.IdentityRepository
	federation    ports.ExternalIdentityRepository
	provisioner   ports.TenantProvisioner
	memberships   ports.MembershipRepository
	passwords     ports.PasswordHasher
	sessions      ports.SessionIssuer
	audit         ports.AuditLog
	tokens        ports.InvitationTokenSigner
	inviteBaseURL string
	inviteTTL     time.Duration
}

type AuthDependencies struct {
	Identities    ports.IdentityRepository
	Federation    ports.ExternalIdentityRepository
	Provisioner   ports.TenantProvisioner
	Memberships   ports.MembershipRepository
	Passwords     ports.PasswordHasher
	Sessions      ports.SessionIssuer
	Audit         ports.AuditLog
	Tokens        ports.InvitationTokenSigner
	InviteBaseURL string
	InviteTTL     time.Duration
}

func NewAuthService(dependencies *AuthDependencies) *AuthService {
	return &AuthService{
		identities: dependencies.Identities, federation: dependencies.Federation, provisioner: dependencies.Provisioner,
		memberships: dependencies.Memberships, passwords: dependencies.Passwords,
		sessions: dependencies.Sessions, audit: dependencies.Audit,
		tokens:        dependencies.Tokens,
		inviteBaseURL: strings.TrimRight(dependencies.InviteBaseURL, "/"), inviteTTL: dependencies.InviteTTL,
	}
}

func (service *AuthService) LoginExternal(ctx context.Context, identity domain.ExternalIdentity) (domain.Session, error) {
	user, err := service.federation.FindExternalUser(ctx, identity)
	if err != nil || user.Role.IsSuperAdmin() {
		return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
	}
	session, err := service.sessionForUser(ctx, user, nil)
	if err != nil {
		return domain.Session{}, err
	}
	event := auditEvent(user.ID, tenantID(session.ActiveTenant), "session.oidc_login", string(user.Email))
	if auditErr := service.audit.Append(ctx, &event); auditErr != nil {
		return domain.Session{}, auditErr
	}
	return service.issue(&session)
}

func (service *AuthService) LinkExternalIdentity(ctx context.Context, token string, identity domain.ExternalIdentity) error {
	session, err := service.CurrentSession(ctx, token)
	if err != nil || session.User.Role.IsSuperAdmin() || session.User.Email != identity.Email {
		return domain.NewError(domain.ErrorUnauthorized)
	}
	if err = service.federation.LinkExternalIdentity(ctx, session.User.ID, identity); err != nil {
		return domain.NewError(domain.ErrorInternal)
	}
	event := auditEvent(session.User.ID, tenantID(session.ActiveTenant), "identity.oidc_linked", string(identity.Issuer))
	return service.audit.Append(ctx, &event)
}

func (service *AuthService) AcceptExternalInvitation(ctx context.Context, token string, identity domain.ExternalIdentity, locale domain.Locale) (domain.Session, error) {
	invitation, err := service.memberships.FindInvitation(ctx, invitationHash(token))
	if err != nil {
		return domain.Session{}, err
	}
	if invitation.Email != identity.Email {
		return domain.Session{}, domain.NewError(domain.ErrorInviteEmailMismatch)
	}
	if _, _, err = service.identities.FindByEmail(ctx, identity.Email); err == nil {
		return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
	} else if !isInvalidCredentials(err) {
		return domain.Session{}, domain.NewError(domain.ErrorInternal)
	}
	acceptance := domain.InvitationAcceptance{Invitation: invitation, User: domain.User{Email: identity.Email, Role: domain.RoleUser, Locale: locale, SessionVersion: 1}}
	user, membership, err := service.memberships.AcceptExternalInvitation(ctx, &acceptance, identity)
	if err != nil {
		return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
	}
	return service.issue(&domain.Session{User: user, ActiveTenant: &membership.Tenant, Memberships: []domain.Membership{membership}})
}

func (service *AuthService) Login(ctx context.Context, email, password string) (domain.Session, error) {
	return service.login(ctx, email, password, false)
}

func (service *AuthService) LoginSuperAdmin(ctx context.Context, email, password string) (domain.Session, error) {
	return service.login(ctx, email, password, true)
}

func (service *AuthService) Register(ctx context.Context, rawEmail, password, tenantName string, locale domain.Locale) (domain.Session, error) {
	email, err := domain.ParseEmail(rawEmail)
	if err != nil || !validPassword(password) || len(strings.TrimSpace(tenantName)) < 2 {
		return domain.Session{}, domain.NewError(domain.ErrorValidation)
	}
	hash, err := service.passwords.Hash(password)
	if err != nil {
		return domain.Session{}, domain.NewError(domain.ErrorInternal)
	}
	session, err := service.provisioner.CreateTenantOwner(ctx, domain.TenantOwnerRegistration{Email: email, PasswordHash: hash, Locale: locale, TenantName: tenantName})
	if err != nil {
		return domain.Session{}, err
	}
	return service.issue(&session)
}

func (service *AuthService) EnsureSuperAdmin(ctx context.Context, rawEmail, password string, locale domain.Locale) error {
	email, err := domain.ParseEmail(rawEmail)
	if err != nil || !validPassword(password) {
		return domain.NewError(domain.ErrorValidation)
	}
	hash, err := service.passwords.Hash(password)
	if err != nil {
		return domain.NewError(domain.ErrorInternal)
	}
	return service.identities.EnsureSuperAdmin(ctx, domain.SuperAdminBootstrap{Email: email, PasswordHash: hash, Locale: locale})
}

func (service *AuthService) CurrentSession(ctx context.Context, token string) (domain.Session, error) {
	claim, err := service.sessions.Verify(token)
	if err != nil {
		return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
	}
	user, err := service.identities.FindByID(ctx, claim.User.ID)
	if err != nil || !sameUserSession(claim.User, user) {
		return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
	}
	return service.sessionForUser(ctx, user, claim.ActiveTenantID)
}

func (service *AuthService) Logout(ctx context.Context, token string) error {
	session, err := service.CurrentSession(ctx, token)
	if err != nil {
		return err
	}
	return service.identities.InvalidateSession(ctx, session.User)
}

func (service *AuthService) SwitchTenant(ctx context.Context, token string, tenantID domain.TenantID) (domain.Session, error) {
	session, err := service.CurrentSession(ctx, token)
	if err != nil || session.User.Role.IsSuperAdmin() {
		return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
	}
	membership, err := service.memberships.FindActiveMembership(ctx, session.User.ID, tenantID)
	if err != nil {
		return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
	}
	session.ActiveTenant = &membership.Tenant
	event := auditEvent(session.User.ID, &tenantID, "tenant.switch", membership.Tenant.Name)
	if auditErr := service.audit.Append(ctx, &event); auditErr != nil {
		return domain.Session{}, auditErr
	}
	return service.issue(&session)
}

func (service *AuthService) CreateInvitation(ctx context.Context, token, rawEmail string, role domain.Role) (domain.Invitation, error) {
	session, err := service.CurrentSession(ctx, token)
	if err != nil || session.ActiveTenant == nil {
		return domain.Invitation{}, domain.NewError(domain.ErrorUnauthorized)
	}
	membership, err := service.memberships.FindActiveMembership(ctx, session.User.ID, session.ActiveTenant.ID)
	if err != nil || !membership.CanAdminister() || !role.IsTenantRole() {
		return domain.Invitation{}, domain.NewError(domain.ErrorUnauthorized)
	}
	email, err := domain.ParseEmail(rawEmail)
	if err != nil {
		return domain.Invitation{}, err
	}
	invitation, err := service.newInvitation(session.User.ID, session.ActiveTenant.ID, email, role)
	if err != nil {
		return domain.Invitation{}, err
	}
	invitation, err = service.memberships.CreateInvitation(ctx, &invitation)
	if err != nil {
		return domain.Invitation{}, err
	}
	invitation.DeliveryStatus = "queued"
	return invitation, nil
}

func (service *AuthService) AcceptInvitation(ctx context.Context, token, rawEmail, password string, locale domain.Locale) (domain.Session, error) {
	email, err := domain.ParseEmail(rawEmail)
	if err != nil || !validPassword(password) {
		return domain.Session{}, domain.NewError(domain.ErrorValidation)
	}
	invitation, err := service.memberships.FindInvitation(ctx, invitationHash(token))
	if err != nil {
		return domain.Session{}, err
	}
	if invitation.Email != email {
		return domain.Session{}, domain.NewError(domain.ErrorInviteEmailMismatch)
	}
	user, hash, findErr := service.identities.FindByEmail(ctx, email)
	if findErr == nil && !service.passwords.Verify(password, hash) {
		return domain.Session{}, domain.NewError(domain.ErrorInvalidCredentials)
	}
	if findErr != nil && !isInvalidCredentials(findErr) {
		return domain.Session{}, domain.NewError(domain.ErrorInternal)
	}
	if isInvalidCredentials(findErr) {
		hash, err = service.passwords.Hash(password)
		if err != nil {
			return domain.Session{}, domain.NewError(domain.ErrorInternal)
		}
		user = domain.User{Email: email, Role: domain.RoleUser, Locale: locale, SessionVersion: 1}
	}
	acceptance := domain.InvitationAcceptance{Invitation: invitation, User: user, Password: &hash}
	accepted, membership, err := service.memberships.AcceptInvitation(ctx, &acceptance)
	if err != nil {
		return domain.Session{}, err
	}
	acceptedSession := domain.Session{User: accepted, ActiveTenant: &membership.Tenant, Memberships: []domain.Membership{membership}}
	return service.issue(&acceptedSession)
}

func (service *AuthService) login(ctx context.Context, rawEmail, password string, requireSuperAdmin bool) (domain.Session, error) {
	email, err := domain.ParseEmail(rawEmail)
	if err != nil {
		service.passwords.Verify(password, "")
		return domain.Session{}, domain.NewError(domain.ErrorInvalidCredentials)
	}
	user, hash, err := service.identities.FindByEmail(ctx, email)
	if !service.passwords.Verify(password, hash) || err != nil {
		return domain.Session{}, domain.NewError(domain.ErrorInvalidCredentials)
	}
	if requireSuperAdmin != user.Role.IsSuperAdmin() {
		return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
	}
	session, err := service.sessionForUser(ctx, user, nil)
	if err != nil {
		return domain.Session{}, err
	}
	event := auditEvent(user.ID, tenantID(session.ActiveTenant), "session.login", string(user.Email))
	if auditErr := service.audit.Append(ctx, &event); auditErr != nil {
		return domain.Session{}, auditErr
	}
	return service.issue(&session)
}

func (service *AuthService) sessionForUser(ctx context.Context, user domain.User, activeID *domain.TenantID) (domain.Session, error) {
	session := domain.Session{User: user, Memberships: make([]domain.Membership, 0)}
	if user.Role.IsSuperAdmin() {
		return session, nil
	}
	memberships, err := service.memberships.MembershipsForUser(ctx, user.ID)
	if err != nil || len(memberships) == 0 {
		return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
	}
	session.Memberships = memberships
	active := memberships[0].Tenant
	if activeID != nil {
		found := false
		for _, membership := range memberships {
			if membership.Tenant.ID == *activeID {
				active = membership.Tenant
				found = true
				break
			}
		}
		if !found {
			return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
		}
	}
	session.ActiveTenant = &active
	return session, nil
}

func (service *AuthService) issue(session *domain.Session) (domain.Session, error) {
	claim := domain.SessionClaim{User: session.User}
	if session.ActiveTenant != nil {
		id := session.ActiveTenant.ID
		claim.ActiveTenantID = &id
	}
	token, err := service.sessions.Issue(&claim)
	if err != nil {
		return domain.Session{}, domain.NewError(domain.ErrorInternal)
	}
	session.Token = token
	return *session, nil
}

func (service *AuthService) newInvitation(actor domain.UserID, tenant domain.TenantID, email domain.Email, role domain.Role) (domain.Invitation, error) {
	id, err := service.tokens.NewInvitationID()
	if err != nil {
		return domain.Invitation{}, domain.NewError(domain.ErrorInternal)
	}
	invitation := domain.Invitation{ID: id, TenantID: tenant, Email: email, Role: role, CreatedBy: actor, ExpiresAt: time.Now().Add(service.inviteTTL)}
	raw, err := service.tokens.Token(&invitation)
	if err != nil {
		return domain.Invitation{}, domain.NewError(domain.ErrorInternal)
	}
	invitation.TokenHash = invitationHash(raw)
	invitation.Acceptance = service.inviteBaseURL + "/invite?token=" + raw
	return invitation, nil
}

func invitationHash(token string) domain.InvitationHash {
	value := sha256.Sum256([]byte(token))
	return domain.InvitationHash(base64.RawURLEncoding.EncodeToString(value[:]))
}

func validPassword(password string) bool {
	return len(password) >= 12 && len([]byte(password)) <= 72
}

func sameUserSession(claimed, current domain.User) bool {
	return claimed.ID == current.ID && claimed.Role == current.Role && claimed.SessionVersion == current.SessionVersion
}

func isInvalidCredentials(err error) bool {
	var domainError *domain.Error
	return errors.As(err, &domainError) && domainError.Kind == domain.ErrorInvalidCredentials
}

func auditEvent(actor domain.UserID, tenant *domain.TenantID, action, target string) domain.AuditEvent {
	return domain.AuditEvent{ActorID: &actor, TenantID: tenant, Action: action, Target: target}
}

func tenantID(tenant *domain.Tenant) *domain.TenantID {
	if tenant == nil {
		return nil
	}
	id := tenant.ID
	return &id
}
