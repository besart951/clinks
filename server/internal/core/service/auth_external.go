package service

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func (service *AuthService) LoginExternal(
	ctx context.Context,
	identity domain.ExternalIdentity,
) (domain.Session, error) {
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

	if user.IsSuperAdmin {
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

func (service *AuthService) LinkExternalIdentity(
	ctx context.Context,
	token string,
	identity domain.ExternalIdentity,
) error {
	session, err := service.CurrentSession(ctx, token)
	if err != nil {
		return err
	}

	if session.User.IsSuperAdmin ||
		session.User.Email != identity.Email {
		return domain.NewError(domain.ErrorUnauthorized)
	}

	if err := service.federation.Link(
		ctx,
		session.User.ID,
		identity,
	); err != nil {
		return err
	}

	return service.appendAudit(
		ctx,
		session.User.ID,
		tenantID(session.ActiveTenant),
		"identity.oidc_linked",
		string(identity.Issuer),
	)
}

func (service *AuthService) AcceptExternalInvitation(
	ctx context.Context,
	token string,
	identity domain.ExternalIdentity,
	locale domain.Locale,
) (domain.Session, error) {
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

	_, _, err = service.identities.FindByEmail(
		ctx,
		identity.Email,
	)

	switch {
	case err == nil:
		return domain.Session{},
			domain.NewError(domain.ErrorUnauthorized)

	case !isInvalidCredentials(err):
		return domain.Session{}, err
	}

	acceptance := domain.InvitationAcceptance{
		Invitation: invitation,
		User: domain.User{
			Email:          identity.Email,
			IsSuperAdmin:   false,
			Locale:         locale,
			SessionVersion: 1,
		},
	}

	user, membership, err :=
		service.invitations.AcceptExternalInvitation(
			ctx,
			acceptance,
			identity,
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

	if err := service.appendAudit(
		ctx,
		user.ID,
		new(membership.Tenant.ID),
		"invitation.accepted_oidc",
		string(invitation.ID),
	); err != nil {
		return domain.Session{}, err
	}

	return session, nil
}
