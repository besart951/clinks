package service

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func (service *authService) LoginExternal(
	ctx context.Context,
	identity domain.ExternalIdentity,
) (domain.Session, error) {
	if err := identity.Validate(); err != nil {
		return domain.Session{}, err
	}
	user, err := service.federation.FindUser(
		ctx,
		identity.Issuer,
		identity.Subject,
	)
	if err != nil {
		if isInvalidCredentials(err) {
			return domain.Session{},
				domain.NewError(domain.ErrorInvalidCredentials)
		}

		return domain.Session{}, err
	}

	if user.GlobalRole.IsSuperAdministrator() {
		return domain.Session{},
			domain.NewError(domain.ErrorUnauthorized)
	}

	session, err := service.sessionForUser(
		ctx,
		user,
		nil,
	)
	if err != nil {
		return domain.Session{}, err
	}

	session, err = service.issue(session)
	if err != nil {
		return domain.Session{}, err
	}

	if err := service.appendAudit(
		ctx,
		user.ID,
		tenantID(session.ActiveTenant),
		"session.oidc_login",
		string(user.Email),
	); err != nil {
		return domain.Session{}, err
	}

	return session, nil
}

func (service *authService) LinkExternalIdentity(
	ctx context.Context,
	token string,
	identity domain.ExternalIdentity,
) error {
	if err := identity.Validate(); err != nil {
		return err
	}
	session, err := service.CurrentSession(ctx, token)
	if err != nil {
		return err
	}

	if session.User.GlobalRole.IsSuperAdministrator() ||
		session.User.Email != identity.Email {
		return domain.NewError(domain.ErrorUnauthorized)
	}

	if err := service.federation.LinkWithAudit(
		ctx,
		session.User.ID,
		identity,
		tenantID(session.ActiveTenant),
	); err != nil {
		return err
	}

	return nil
}

func (service *authService) AcceptExternalInvitation(
	ctx context.Context,
	token string,
	identity domain.ExternalIdentity,
	locale domain.Locale,
) (domain.Session, error) {
	if err := identity.Validate(); err != nil {
		return domain.Session{}, err
	}
	locale = domain.NewLocale(string(locale))

	if !locale.IsValid() {
		return domain.Session{},
			domain.NewError(domain.ErrorValidation)
	}

	invitation, err := service.findInvitation(
		ctx,
		token,
	)
	if err != nil {
		return domain.Session{}, err
	}

	if invitation.Email != identity.Email {
		return domain.Session{},
			domain.NewError(domain.ErrorInviteEmailMismatch)
	}

	user, _, findErr := service.identities.FindByEmail(
		ctx,
		identity.Email,
	)
	existingUser := findErr == nil
	if existingUser && user.GlobalRole.IsSuperAdministrator() {
		return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
	}
	if findErr != nil && !isInvalidCredentials(findErr) {
		return domain.Session{}, findErr
	}

	if !existingUser {
		user = domain.User{
			Email:          identity.Email,
			GlobalRole:     domain.GlobalRoleUser,
			Locale:         locale,
			SessionVersion: 1,
		}
	}

	acceptance := domain.ExternalInvitationAcceptance{
		Invitation:   invitation,
		User:         user,
		Identity:     identity,
		ExistingUser: existingUser,
	}

	user, membership, err := service.invitations.AcceptExternalInvitation(
		ctx,
		acceptance,
	)
	if err != nil {
		return domain.Session{}, err
	}

	session, err := service.issue(
		domain.Session{
			User:         user,
			ActiveTenant: new(membership.Tenant),
			Memberships: []domain.Membership{
				membership,
			},
		},
	)
	if err != nil {
		return domain.Session{}, err
	}

	return session, nil
}
