package service

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type AuthDependencies struct {
	Identities    ports.SessionIdentityRepository
	Federation    ports.ExternalIdentityRepository
	Provisioner   ports.TenantProvisioner
	Memberships   ports.MembershipSessionReader
	Roles         ports.RoleLookup
	Invitations   ports.InvitationRepository
	Passwords     ports.PasswordHasher
	Sessions      ports.SessionIssuer
	Audit         ports.AuditAppender
	InvitationIDs ports.InvitationIDGenerator
	Tokens        ports.InvitationTokenSigner

	InviteBaseURL string
	InviteTTL     time.Duration

	// Optional test clock.
	Now func() time.Time
}

type authService struct {
	identities    ports.SessionIdentityRepository
	federation    ports.ExternalIdentityRepository
	provisioner   ports.TenantProvisioner
	memberships   ports.MembershipSessionReader
	roles         ports.RoleLookup
	invitations   ports.InvitationRepository
	passwords     ports.PasswordHasher
	sessions      ports.SessionIssuer
	audit         ports.AuditAppender
	invitationIDs ports.InvitationIDGenerator
	tokens        ports.InvitationTokenSigner

	links     invitationLinkBuilder
	inviteTTL time.Duration
	now       func() time.Time
}

func newAuthService(
	dependencies AuthDependencies,
) (*authService, error) {
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

	return &authService{
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

func (service *authService) sessionForUser(
	ctx context.Context,
	user domain.User,
	activeTenantID *domain.TenantID,
) (domain.Session, error) {
	session := domain.Session{
		User:        user,
		Memberships: make([]domain.Membership, 0),
	}

	if user.GlobalRole.IsSuperAdministrator() {
		return session, nil
	}

	memberships, err := service.memberships.MembershipsForUser(
		ctx,
		user.ID,
	)
	if err != nil {
		return domain.Session{}, err
	}

	activeMemberships := make(
		[]domain.Membership,
		0,
		len(memberships),
	)

	for _, membership := range memberships {
		if membership.Status == domain.MembershipActive {
			activeMemberships = append(
				activeMemberships,
				membership,
			)
		}
	}

	if len(activeMemberships) == 0 {
		return domain.Session{},
			domain.NewError(domain.ErrorUnauthorized)
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

	return domain.Session{},
		domain.NewError(domain.ErrorUnauthorized)
}

func (service *authService) issue(
	session domain.Session,
) (domain.Session, error) {
	claim := domain.SessionClaim{
		UserID:         session.User.ID,
		SessionVersion: session.User.SessionVersion,
	}

	if session.ActiveTenant != nil {
		claim.ActiveTenantID = new(
			session.ActiveTenant.ID,
		)
	}

	token, err := service.sessions.Issue(claim)
	if err != nil {
		return domain.Session{},
			domain.NewError(domain.ErrorInternal)
	}

	session.Token = token

	return session, nil
}

func (service *authService) requireTenantPermission(
	ctx context.Context,
	userID domain.UserID,
	tenantID domain.TenantID,
	permission domain.Permission,
) (domain.Membership, error) {
	membership, err := service.memberships.FindActiveMembership(
		ctx,
		userID,
		tenantID,
	)
	if err != nil {
		return domain.Membership{}, err
	}

	permissions, err := service.roles.PermissionsForRole(
		ctx,
		tenantID,
		membership.RoleID,
	)
	if err != nil {
		return domain.Membership{}, err
	}

	if !slices.Contains(permissions, permission) {
		return domain.Membership{},
			domain.NewError(domain.ErrorUnauthorized)
	}

	return membership, nil
}

func (service *authService) appendAudit(
	ctx context.Context,
	actorID domain.UserID,
	tenantID *domain.TenantID,
	action,
	target string,
) error {
	event := domain.AuditEvent{
		OccurredAt: service.now().UTC(),
		ActorID:    new(actorID),
		TenantID:   tenantID,
		Action:     strings.TrimSpace(action),
		Target:     strings.TrimSpace(target),
	}

	return service.audit.Append(
		ctx,
		event,
	)
}

func sameUserSession(
	claim domain.SessionClaim,
	user domain.User,
) bool {
	return claim.UserID == user.ID &&
		claim.SessionVersion == user.SessionVersion
}

func isInvalidCredentials(err error) bool {
	domainError, ok := errors.AsType[*domain.Error](err)

	return ok &&
		domainError.Kind == domain.ErrorInvalidCredentials
}

func tenantID(
	tenant *domain.Tenant,
) *domain.TenantID {
	if tenant == nil {
		return nil
	}

	return new(tenant.ID)
}
