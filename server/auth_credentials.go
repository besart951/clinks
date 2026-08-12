package clinks

import (
	"context"
)

func (auth *Auth) Login(
	ctx context.Context,
	email,
	password string,
) (Session, error) {
	return auth.login(
		ctx,
		email,
		password,
		false,
	)
}

func (auth *Auth) LoginSuperAdmin(
	ctx context.Context,
	email,
	password string,
) (Session, error) {
	return auth.login(
		ctx,
		email,
		password,
		true,
	)
}

func (auth *Auth) Register(
	ctx context.Context,
	rawEmail,
	password,
	tenantName string,
	locale Locale,
) (Session, error) {
	email, err := ParseEmail(rawEmail)
	if err != nil {
		return Session{},
			NewError(ErrorValidation)
	}

	locale = NewLocale(string(locale))
	tenantName, tenantNameErr := NormalizeTenantName(tenantName)

	if !validPassword(password) ||
		!locale.IsValid() ||
		tenantNameErr != nil {
		return Session{},
			NewError(ErrorValidation)
	}

	passwordHash, err := auth.passwords.Hash(password)
	if err != nil {
		return Session{},
			NewError(ErrorInternal)
	}

	session, err := auth.provisioner.CreateTenantOwner(
		ctx,
		TenantOwnerRegistration{
			Email:        email,
			PasswordHash: passwordHash,
			Locale:       locale,
			TenantName:   tenantName,
		},
	)
	if err != nil {
		return Session{}, err
	}

	return auth.issue(session)
}

func (auth *Auth) CurrentSession(
	ctx context.Context,
	token string,
) (Session, error) {
	claim, err := auth.sessions.Verify(token)
	if err != nil {
		return Session{},
			NewError(ErrorInvalidCredentials)
	}

	user, err := auth.identities.FindByID(
		ctx,
		claim.UserID,
	)
	if err != nil ||
		!sameUserSession(claim, user) {
		return Session{},
			NewError(ErrorInvalidCredentials)
	}

	session, err := auth.sessionForUser(
		ctx,
		user,
		claim.ActiveTenantID,
	)
	if err != nil {
		return Session{}, err
	}

	session.Token = token
	return session, nil
}

func (auth *Auth) Logout(
	ctx context.Context,
	session Session,
) error {
	if !session.User.ID.IsValid() {
		return NewError(ErrorInvalidCredentials)
	}

	return auth.identities.InvalidateSession(
		ctx,
		session.User.ID,
	)
}

func (auth *Auth) SwitchTenant(
	ctx context.Context,
	session Session,
	requestedTenantID TenantID,
) (Session, error) {
	if err := requestedTenantID.Validate(); err != nil {
		return Session{}, err
	}

	if session.User.GlobalRole.IsSuperAdministrator() {
		return Session{},
			NewError(ErrorUnauthorized)
	}

	membership, err := auth.memberships.FindActiveMembership(
		ctx,
		session.User.ID,
		requestedTenantID,
	)
	if err != nil {
		return Session{}, err
	}

	session.ActiveTenant = new(membership.Tenant)
	sessionVersion, err := auth.identities.RotateTenantSession(
		ctx,
		session.User.ID,
		requestedTenantID,
		membership.Tenant.Name,
	)
	if err != nil {
		return Session{}, err
	}
	session.User.SessionVersion = sessionVersion

	session, err = auth.issue(session)
	if err != nil {
		return Session{}, err
	}

	return session, nil
}

func (auth *Auth) login(
	ctx context.Context,
	rawEmail,
	password string,
	requireSuperAdmin bool,
) (Session, error) {
	email, err := ParseEmail(rawEmail)
	if err != nil {
		auth.passwords.Verify(
			password,
			PasswordHash(""),
		)

		return Session{},
			NewError(ErrorInvalidCredentials)
	}

	user, passwordHash, findErr := auth.identities.FindByEmail(
		ctx,
		email,
	)

	passwordValid := auth.passwords.Verify(
		password,
		passwordHash,
	)

	if findErr != nil || !passwordValid {
		return Session{},
			NewError(ErrorInvalidCredentials)
	}

	if requireSuperAdmin != user.GlobalRole.IsSuperAdministrator() {
		return Session{},
			NewError(ErrorInvalidCredentials)
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
		"session.login",
		string(user.Email),
	); err != nil {
		return Session{}, err
	}

	return session, nil
}

func validPassword(password string) bool {
	return ValidatePassword(password) == nil
}
