package clinks

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"strings"
)

const invitationDeliveryQueued = "queued"

func (auth *Auth) CreateInvitation(
	ctx context.Context,
	session Session,
	rawEmail string,
	roleID RoleID,
) (Invitation, error) {
	if !roleID.IsValid() {
		return Invitation{},
			NewError(ErrorValidation)
	}

	if session.User.GlobalRole.IsSuperAdministrator() ||
		session.ActiveTenant == nil {
		return Invitation{},
			NewError(ErrorUnauthorized)
	}

	tenantID := session.ActiveTenant.ID

	if _, err := auth.requireTenantPermission(
		ctx,
		session.User.ID,
		tenantID,
		PermissionUserManage,
	); err != nil {
		return Invitation{}, err
	}

	// This also verifies that the target role belongs to the
	// currently active tenant.
	role, err := auth.roles.FindRole(
		ctx,
		tenantID,
		roleID,
	)
	if err != nil {
		return Invitation{}, err
	}

	email, err := ParseEmail(rawEmail)
	if err != nil {
		return Invitation{}, err
	}

	invitation, rawToken, err := auth.newInvitation(
		session.User.ID,
		tenantID,
		email,
		roleID,
		session.User.Locale,
	)
	if err != nil {
		return Invitation{}, err
	}
	invitation.Role = role

	invitation, err = auth.invitations.CreateInvitation(
		ctx,
		invitation,
	)
	if err != nil {
		return Invitation{}, err
	}

	// The raw invitation token is deliberately added only after
	// persistence. PostgreSQL receives TokenHash, not the raw token.
	invitation.Acceptance = auth.links.URL(rawToken)

	return invitation, nil
}

func (auth *Auth) AcceptInvitation(
	ctx context.Context,
	token,
	rawEmail,
	password string,
	locale Locale,
) (Session, error) {
	email, err := ParseEmail(rawEmail)
	if err != nil || !validPassword(password) {
		return Session{},
			NewError(ErrorValidation)
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

	if invitation.Email != email {
		return Session{},
			NewError(ErrorInviteEmailMismatch)
	}

	user, currentPasswordHash, findErr := auth.identities.FindByEmail(
		ctx,
		email,
	)

	var passwordHash PasswordHash
	existingUser := false

	switch {
	case findErr == nil:
		existingUser = true
		if user.GlobalRole.IsSuperAdministrator() {
			return Session{},
				NewError(ErrorUnauthorized)
		}

		if !auth.passwords.Verify(
			password,
			currentPasswordHash,
		) {
			return Session{},
				NewError(
					ErrorInvalidCredentials,
				)
		}

	case isInvalidCredentials(findErr):
		passwordHash, err = auth.passwords.Hash(password)
		if err != nil {
			return Session{},
				NewError(ErrorInternal)
		}

		user = User{
			Email:          email,
			GlobalRole:     GlobalRoleUser,
			Locale:         locale,
			SessionVersion: 1,
		}

	default:
		return Session{}, findErr
	}

	acceptance := PasswordInvitationAcceptance{
		Invitation:   invitation,
		User:         user,
		PasswordHash: passwordHash,
		ExistingUser: existingUser,
	}

	acceptedUser, membership, err := auth.invitations.AcceptInvitation(
		ctx,
		acceptance,
	)
	if err != nil {
		return Session{}, err
	}

	session, err := auth.issue(
		Session{
			User:         acceptedUser,
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

func (auth *Auth) findInvitation(
	ctx context.Context,
	token string,
) (Invitation, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return Invitation{},
			NewError(ErrorInvitationInvalid)
	}

	invitation, err := auth.invitations.FindInvitation(
		ctx,
		invitationHash(token),
	)
	if err != nil {
		return Invitation{}, err
	}

	if invitation.IsUsed() {
		return Invitation{},
			NewError(ErrorInvitationUsed)
	}

	if invitation.IsExpired(auth.now()) {
		return Invitation{},
			NewError(ErrorInvitationExpired)
	}

	return invitation, nil
}

func (auth *Auth) newInvitation(
	actorID UserID,
	tenantID TenantID,
	email Email,
	roleID RoleID,
	locale Locale,
) (Invitation, string, error) {
	invitationID, err := auth.invitationIDs.NewInvitationID()
	if err != nil {
		return Invitation{},
			"",
			NewError(ErrorInternal)
	}

	invitation := Invitation{
		ID:             invitationID,
		TenantID:       tenantID,
		Email:          email,
		RoleID:         roleID,
		ExpiresAt:      auth.now().UTC().Add(auth.inviteTTL),
		CreatedBy:      actorID,
		DeliveryStatus: invitationDeliveryQueued,
		Locale:         locale,
	}

	rawToken, err := auth.tokens.Token(invitation)
	if err != nil {
		return Invitation{},
			"",
			NewError(ErrorInternal)
	}

	invitation.TokenHash = invitationHash(rawToken)

	return invitation, rawToken, nil
}

func invitationHash(
	token string,
) InvitationHash {
	hash := sha256.Sum256(
		[]byte(strings.TrimSpace(token)),
	)

	return InvitationHash(
		base64.RawURLEncoding.EncodeToString(
			hash[:],
		),
	)
}
