package clinks

import (
	"context"
)

func (auth *Auth) LoginExternal(
	ctx context.Context,
	identity ExternalIdentity,
) (Session, error) {
	if err := identity.Validate(); err != nil {
		return Session{}, err
	}
	user, err := auth.federation.FindUser(
		ctx,
		identity.Issuer,
		identity.Subject,
	)
	if err != nil {
		if isInvalidCredentials(err) {
			return Session{},
				NewError(ErrorInvalidCredentials)
		}

		return Session{}, err
	}

	if user.GlobalRole.IsSuperAdministrator() {
		return Session{},
			NewError(ErrorUnauthorized)
	}

	session, err := auth.sessionForUser(
		ctx,
		user,
		nil,
	)
	if err != nil {
		return Session{}, err
	}

	session, err = auth.issue(session)
	if err != nil {
		return Session{}, err
	}

	if err := auth.appendAudit(
		ctx,
		user.ID,
		tenantID(session.ActiveTenant),
		"session.oidc_login",
		string(user.Email),
	); err != nil {
		return Session{}, err
	}

	return session, nil
}

func (auth *Auth) LinkExternalIdentity(
	ctx context.Context,
	session Session,
	identity ExternalIdentity,
) error {
	if err := identity.Validate(); err != nil {
		return err
	}
	if session.User.GlobalRole.IsSuperAdministrator() ||
		session.User.Email != identity.Email {
		return NewError(ErrorUnauthorized)
	}

	if err := auth.federation.LinkWithAudit(
		ctx,
		session.User.ID,
		identity,
		tenantID(session.ActiveTenant),
	); err != nil {
		return err
	}

	return nil
}

func (auth *Auth) AcceptExternalInvitation(
	ctx context.Context,
	token string,
	identity ExternalIdentity,
	locale Locale,
) (Session, error) {
	if err := identity.Validate(); err != nil {
		return Session{}, err
	}
	locale = NewLocale(string(locale))

	if !locale.IsValid() {
		return Session{},
			NewError(ErrorValidation)
	}

	invitation, err := auth.findInvitation(
		ctx,
		token,
	)
	if err != nil {
		return Session{}, err
	}

	if invitation.Email != identity.Email {
		return Session{},
			NewError(ErrorInviteEmailMismatch)
	}

	user, _, findErr := auth.identities.FindByEmail(
		ctx,
		identity.Email,
	)
	existingUser := findErr == nil
	if existingUser && user.GlobalRole.IsSuperAdministrator() {
		return Session{}, NewError(ErrorUnauthorized)
	}
	if findErr != nil && !isInvalidCredentials(findErr) {
		return Session{}, findErr
	}

	if !existingUser {
		user = User{
			Email:          identity.Email,
			GlobalRole:     GlobalRoleUser,
			Locale:         locale,
			SessionVersion: 1,
		}
	}

	acceptance := ExternalInvitationAcceptance{
		Invitation:   invitation,
		User:         user,
		Identity:     identity,
		ExistingUser: existingUser,
	}

	user, membership, err := auth.invitations.AcceptExternalInvitation(
		ctx,
		acceptance,
	)
	if err != nil {
		return Session{}, err
	}

	session, err := auth.issue(
		Session{
			User:         user,
			ActiveTenant: new(membership.Tenant),
			Memberships: []Membership{
				membership,
			},
		},
	)
	if err != nil {
		return Session{}, err
	}

	return session, nil
}
