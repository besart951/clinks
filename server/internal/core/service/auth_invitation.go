package service

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"strings"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const invitationDeliveryQueued = "queued"

func (service *AuthService) CreateInvitation(
	ctx context.Context,
	token,
	rawEmail string,
	roleID domain.RoleID,
) (domain.Invitation, error) {
	if !roleID.IsValid() {
		return domain.Invitation{},
			domain.NewError(domain.ErrorValidation)
	}

	session, err := service.CurrentSession(ctx, token)
	if err != nil {
		return domain.Invitation{}, err
	}

	if session.User.IsSuperAdmin ||
		session.ActiveTenant == nil {
		return domain.Invitation{},
			domain.NewError(domain.ErrorUnauthorized)
	}

	tenantID := session.ActiveTenant.ID

	if _, err := service.requireTenantPermission(
		ctx,
		session.User.ID,
		tenantID,
		domain.PermissionTenantManage,
	); err != nil {
		return domain.Invitation{}, err
	}

	// This also verifies that the target role belongs to the
	// currently active tenant.
	if _, err := service.roles.FindRole(
		ctx,
		tenantID,
		roleID,
	); err != nil {
		return domain.Invitation{}, err
	}

	email, err := domain.ParseEmail(rawEmail)
	if err != nil {
		return domain.Invitation{}, err
	}

	invitation, rawToken, err := service.newInvitation(
		session.User.ID,
		tenantID,
		email,
		roleID,
	)
	if err != nil {
		return domain.Invitation{}, err
	}

	invitation, err = service.invitations.CreateInvitation(
		ctx,
		invitation,
	)
	if err != nil {
		return domain.Invitation{}, err
	}

	// The raw invitation token is deliberately added only after
	// persistence. PostgreSQL receives TokenHash, not the raw token.
	invitation.Acceptance = service.links.URL(rawToken)

	return invitation, nil
}

func (service *AuthService) AcceptInvitation(
	ctx context.Context,
	token,
	rawEmail,
	password string,
	locale domain.Locale,
) (domain.Session, error) {
	email, err := domain.ParseEmail(rawEmail)
	if err != nil || !validPassword(password) {
		return domain.Session{},
			domain.NewError(domain.ErrorValidation)
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

	if invitation.Email != email {
		return domain.Session{},
			domain.NewError(domain.ErrorInviteEmailMismatch)
	}

	user, currentPasswordHash, findErr :=
		service.identities.FindByEmail(
			ctx,
			email,
		)

	var newPasswordHash *domain.PasswordHash

	switch {
	case findErr == nil:
		if user.IsSuperAdmin {
			return domain.Session{},
				domain.NewError(domain.ErrorUnauthorized)
		}

		if !service.passwords.Verify(
			password,
			currentPasswordHash,
		) {
			return domain.Session{},
				domain.NewError(
					domain.ErrorInvalidCredentials,
				)
		}

	case isInvalidCredentials(findErr):
		passwordHash, err := service.passwords.Hash(password)
		if err != nil {
			return domain.Session{},
				domain.NewError(domain.ErrorInternal)
		}

		newPasswordHash = new(passwordHash)

		user = domain.User{
			Email:          email,
			IsSuperAdmin:   false,
			Locale:         locale,
			SessionVersion: 1,
		}

	default:
		return domain.Session{}, findErr
	}

	acceptance := domain.InvitationAcceptance{
		Invitation: invitation,
		User:       user,
		Password:   newPasswordHash,
	}

	acceptedUser, membership, err :=
		service.invitations.AcceptInvitation(
			ctx,
			acceptance,
		)
	if err != nil {
		return domain.Session{}, err
	}

	session, err := service.issue(
		domain.Session{
			User:         acceptedUser,
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
		acceptedUser.ID,
		new(membership.Tenant.ID),
		"invitation.accepted",
		string(invitation.ID),
	); err != nil {
		return domain.Session{}, err
	}

	return session, nil
}

func (service *AuthService) findInvitation(
	ctx context.Context,
	token string,
) (domain.Invitation, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return domain.Invitation{},
			domain.NewError(domain.ErrorInvitationInvalid)
	}

	invitation, err := service.invitations.FindInvitation(
		ctx,
		invitationHash(token),
	)
	if err != nil {
		return domain.Invitation{}, err
	}

	if invitation.IsUsed() {
		return domain.Invitation{},
			domain.NewError(domain.ErrorInvitationUsed)
	}

	if invitation.IsExpired(service.now()) {
		return domain.Invitation{},
			domain.NewError(domain.ErrorInvitationExpired)
	}

	return invitation, nil
}

func (service *AuthService) newInvitation(
	actorID domain.UserID,
	tenantID domain.TenantID,
	email domain.Email,
	roleID domain.RoleID,
) (domain.Invitation, string, error) {
	invitationID, err :=
		service.invitationIDs.NewInvitationID()
	if err != nil {
		return domain.Invitation{},
			"",
			domain.NewError(domain.ErrorInternal)
	}

	invitation := domain.Invitation{
		ID:             invitationID,
		TenantID:       tenantID,
		Email:          email,
		RoleID:         roleID,
		ExpiresAt:      service.now().UTC().Add(service.inviteTTL),
		CreatedBy:      actorID,
		DeliveryStatus: invitationDeliveryQueued,
	}

	rawToken, err := service.tokens.Token(invitation)
	if err != nil {
		return domain.Invitation{},
			"",
			domain.NewError(domain.ErrorInternal)
	}

	invitation.TokenHash = invitationHash(rawToken)

	return invitation, rawToken, nil
}

func invitationHash(
	token string,
) domain.InvitationHash {
	hash := sha256.Sum256(
		[]byte(strings.TrimSpace(token)),
	)

	return domain.InvitationHash(
		base64.RawURLEncoding.EncodeToString(
			hash[:],
		),
	)
}
