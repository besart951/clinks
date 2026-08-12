package clinks

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"
)

type AuthDependencies struct {
	Identities    SessionIdentityStore
	Federation    ExternalIdentityStore
	Provisioner   TenantProvisioner
	Memberships   MembershipSessionReader
	Roles         RoleLookup
	Invitations   InvitationStore
	Passwords     PasswordHasher
	Sessions      SessionIssuer
	Audit         AuditAppender
	InvitationIDs InvitationIDGenerator
	Tokens        InvitationTokenSigner

	InviteBaseURL string
	InviteTTL     time.Duration

	// Optional test clock.
	Now func() time.Time
}

type Auth struct {
	identities    SessionIdentityStore
	federation    ExternalIdentityStore
	provisioner   TenantProvisioner
	memberships   MembershipSessionReader
	roles         RoleLookup
	invitations   InvitationStore
	passwords     PasswordHasher
	sessions      SessionIssuer
	audit         AuditAppender
	invitationIDs InvitationIDGenerator
	tokens        InvitationTokenSigner

	links     invitationLinkBuilder
	inviteTTL time.Duration
	now       func() time.Time
}

func NewAuth(
	dependencies AuthDependencies,
) (*Auth, error) {
	switch {
	case dependencies.Identities == nil:
		return nil, errors.New("auth service: identities dependency is required")
	case dependencies.Federation == nil:
		return nil, errors.New("auth service: federation dependency is required")
	case dependencies.Provisioner == nil:
		return nil, errors.New("auth service: provisioner dependency is required")
	case dependencies.Memberships == nil:
		return nil, errors.New("auth service: memberships dependency is required")
	case dependencies.Roles == nil:
		return nil, errors.New("auth service: roles dependency is required")
	case dependencies.Invitations == nil:
		return nil, errors.New("auth service: invitations dependency is required")
	case dependencies.Passwords == nil:
		return nil, errors.New("auth service: passwords dependency is required")
	case dependencies.Sessions == nil:
		return nil, errors.New("auth service: sessions dependency is required")
	case dependencies.Audit == nil:
		return nil, errors.New("auth service: audit dependency is required")
	case dependencies.InvitationIDs == nil:
		return nil, errors.New("auth service: invitation ID dependency is required")
	case dependencies.Tokens == nil:
		return nil, errors.New("auth service: invitation token dependency is required")
	}
	if dependencies.InviteTTL <= 0 {
		return nil, errors.New(
			"auth service: invitation TTL must be positive",
		)
	}

	links, err := newInvitationLinkBuilder(
		dependencies.InviteBaseURL,
	)
	if err != nil {
		return nil, err
	}

	now := dependencies.Now
	if now == nil {
		now = time.Now
	}

	return &Auth{
		identities:    dependencies.Identities,
		federation:    dependencies.Federation,
		provisioner:   dependencies.Provisioner,
		memberships:   dependencies.Memberships,
		roles:         dependencies.Roles,
		invitations:   dependencies.Invitations,
		passwords:     dependencies.Passwords,
		sessions:      dependencies.Sessions,
		audit:         dependencies.Audit,
		invitationIDs: dependencies.InvitationIDs,
		tokens:        dependencies.Tokens,
		links:         links,
		inviteTTL:     dependencies.InviteTTL,
		now:           now,
	}, nil
}

func (auth *Auth) sessionForUser(
	ctx context.Context,
	user User,
	activeTenantID *TenantID,
) (Session, error) {
	session := Session{
		User:        user,
		Memberships: make([]Membership, 0),
	}

	if user.GlobalRole.IsSuperAdministrator() {
		return session, nil
	}

	memberships, err := auth.memberships.MembershipsForUser(
		ctx,
		user.ID,
	)
	if err != nil {
		return Session{}, err
	}

	activeMemberships := make(
		[]Membership,
		0,
		len(memberships),
	)

	for _, membership := range memberships {
		if membership.Status == MembershipActive {
			activeMemberships = append(
				activeMemberships,
				membership,
			)
		}
	}

	if len(activeMemberships) == 0 {
		return Session{},
			NewError(ErrorUnauthorized)
	}

	session.Memberships = activeMemberships

	if activeTenantID == nil {
		session.ActiveTenant = new(
			activeMemberships[0].Tenant,
		)

		return session, nil
	}

	for _, membership := range activeMemberships {
		if membership.Tenant.ID == *activeTenantID {
			session.ActiveTenant = new(
				membership.Tenant,
			)

			return session, nil
		}
	}

	return Session{},
		NewError(ErrorUnauthorized)
}

func (auth *Auth) issue(
	session Session,
) (Session, error) {
	claim := SessionClaim{
		UserID:         session.User.ID,
		SessionVersion: session.User.SessionVersion,
	}

	if session.ActiveTenant != nil {
		claim.ActiveTenantID = new(
			session.ActiveTenant.ID,
		)
	}

	token, err := auth.sessions.Issue(claim)
	if err != nil {
		return Session{},
			NewError(ErrorInternal)
	}

	session.Token = token

	return session, nil
}

func (auth *Auth) requireTenantPermission(
	ctx context.Context,
	userID UserID,
	tenantID TenantID,
	permission Permission,
) (Membership, error) {
	membership, err := auth.memberships.FindActiveMembership(
		ctx,
		userID,
		tenantID,
	)
	if err != nil {
		return Membership{}, err
	}

	permissions, err := auth.roles.PermissionsForRole(
		ctx,
		tenantID,
		membership.RoleID,
	)
	if err != nil {
		return Membership{}, err
	}

	if !slices.Contains(permissions, permission) {
		return Membership{},
			NewError(ErrorUnauthorized)
	}

	return membership, nil
}

func (auth *Auth) appendAudit(
	ctx context.Context,
	actorID UserID,
	tenantID *TenantID,
	action,
	target string,
) error {
	event := AuditEvent{
		OccurredAt: auth.now().UTC(),
		ActorID:    new(actorID),
		TenantID:   tenantID,
		Action:     strings.TrimSpace(action),
		Target:     strings.TrimSpace(target),
	}

	return auth.audit.Append(
		ctx,
		event,
	)
}

func sameUserSession(
	claim SessionClaim,
	user User,
) bool {
	return claim.UserID == user.ID &&
		claim.SessionVersion == user.SessionVersion
}

func isInvalidCredentials(err error) bool {
	domainError, ok := errors.AsType[*Error](err)

	return ok &&
		domainError.Kind == ErrorInvalidCredentials
}

func tenantID(
	tenant *Tenant,
) *TenantID {
	if tenant == nil {
		return nil
	}

	return new(tenant.ID)
}
