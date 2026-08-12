package service

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func (service *authService) Login(
	ctx context.Context,
	email,
	password string,
) (domain.Session, error) {
	return service.login(
		ctx,
		email,
		password,
		false,
	)
}

func (service *authService) LoginSuperAdmin(
	ctx context.Context,
	email,
	password string,
) (domain.Session, error) {
	return service.login(
		ctx,
		email,
		password,
		true,
	)
}

func (service *authService) Register(
	ctx context.Context,
	rawEmail,
	password,
	tenantName string,
	locale domain.Locale,
) (domain.Session, error) {
	email, err := domain.ParseEmail(rawEmail)
	if err != nil {
		return domain.Session{},
			domain.NewError(domain.ErrorValidation)
	}

	locale = domain.NewLocale(string(locale))
	tenantName, tenantNameErr := domain.NormalizeTenantName(tenantName)

	if !validPassword(password) ||
		!locale.IsValid() ||
		tenantNameErr != nil {
		return domain.Session{},
			domain.NewError(domain.ErrorValidation)
	}

	passwordHash, err := service.passwords.Hash(password)
	if err != nil {
		return domain.Session{},
			domain.NewError(domain.ErrorInternal)
	}

	session, err := service.provisioner.CreateTenantOwner(
		ctx,
		domain.TenantOwnerRegistration{
			Email:        email,
			PasswordHash: passwordHash,
			Locale:       locale,
			TenantName:   tenantName,
		},
	)
	if err != nil {
		return domain.Session{}, err
	}

	return service.issue(session)
}

func (service *authService) CurrentSession(
	ctx context.Context,
	token string,
) (domain.Session, error) {
	claim, err := service.sessions.Verify(token)
	if err != nil {
		return domain.Session{},
			domain.NewError(domain.ErrorInvalidCredentials)
	}

	user, err := service.identities.FindByID(
		ctx,
		claim.UserID,
	)
	if err != nil ||
		!sameUserSession(claim, user) {
		return domain.Session{},
			domain.NewError(domain.ErrorInvalidCredentials)
	}

	session, err := service.sessionForUser(
		ctx,
		user,
		claim.ActiveTenantID,
	)
	if err != nil {
		return domain.Session{}, err
	}

	session.Token = token
	return session, nil
}

func (service *authService) Logout(
	ctx context.Context,
	token string,
) error {
	session, err := service.CurrentSession(ctx, token)
	if err != nil {
		return err
	}

	return service.identities.InvalidateSession(
		ctx,
		session.User.ID,
	)
}

func (service *authService) SwitchTenant(
	ctx context.Context,
	token string,
	requestedTenantID domain.TenantID,
) (domain.Session, error) {
	if err := requestedTenantID.Validate(); err != nil {
		return domain.Session{}, err
	}

	session, err := service.CurrentSession(ctx, token)
	if err != nil {
		return domain.Session{}, err
	}

	if session.User.GlobalRole.IsSuperAdministrator() {
		return domain.Session{},
			domain.NewError(domain.ErrorUnauthorized)
	}

	membership, err := service.memberships.FindActiveMembership(
		ctx,
		session.User.ID,
		requestedTenantID,
	)
	if err != nil {
		return domain.Session{}, err
	}

	session.ActiveTenant = new(membership.Tenant)
	sessionVersion, err := service.identities.RotateTenantSession(
		ctx,
		session.User.ID,
		requestedTenantID,
		membership.Tenant.Name,
	)
	if err != nil {
		return domain.Session{}, err
	}
	session.User.SessionVersion = sessionVersion

	session, err = service.issue(session)
	if err != nil {
		return domain.Session{}, err
	}

	return session, nil
}

func (service *authService) login(
	ctx context.Context,
	rawEmail,
	password string,
	requireSuperAdmin bool,
) (domain.Session, error) {
	email, err := domain.ParseEmail(rawEmail)
	if err != nil {
		service.passwords.Verify(
			password,
			domain.PasswordHash(""),
		)

		return domain.Session{},
			domain.NewError(domain.ErrorInvalidCredentials)
	}

	user, passwordHash, findErr := service.identities.FindByEmail(
		ctx,
		email,
	)

	passwordValid := service.passwords.Verify(
		password,
		passwordHash,
	)

	if findErr != nil || !passwordValid {
		return domain.Session{},
			domain.NewError(domain.ErrorInvalidCredentials)
	}

	if requireSuperAdmin != user.GlobalRole.IsSuperAdministrator() {
		return domain.Session{},
			domain.NewError(domain.ErrorInvalidCredentials)
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
		"session.login",
		string(user.Email),
	); err != nil {
		return domain.Session{}, err
	}

	return session, nil
}

func validPassword(password string) bool {
	return domain.ValidatePassword(password) == nil
}
