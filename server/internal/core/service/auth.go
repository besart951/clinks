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
	Identities    ports.IdentityRepository
	Federation    ports.ExternalIdentityRepository
	Provisioner   ports.TenantProvisioner
	Memberships   ports.MembershipRepository
	Roles         ports.RoleReader
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

type AuthService struct {
	identities    ports.IdentityRepository
	federation    ports.ExternalIdentityRepository
	provisioner   ports.TenantProvisioner
	memberships   ports.MembershipRepository
	roles         ports.RoleReader
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

func NewAuthService(
	dependencies AuthDependencies,
) (*AuthService, error) {
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

	return &AuthService{
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

func (service *AuthService) sessionForUser(
	ctx context.Context,
	user domain.User,
	activeTenantID *domain.TenantID,
) (domain.Session, error) {
	session := domain.Session{
		User:        user,
		Memberships: make([]domain.Membership, 0),
	}

	if user.IsSuperAdmin {
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

func (service *AuthService) issue(
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

func (service *AuthService) requireTenantPermission(
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

func (service *AuthService) appendAudit(
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
