package service

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const (
	minimumPasswordCharacters = 12
	maximumPasswordBytes      = 72
)

func (service *AuthService) Login(
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

func (service *AuthService) LoginSuperAdmin(
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

func (service *AuthService) Register(
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
	tenantName = strings.TrimSpace(tenantName)

	if !validPassword(password) ||
		!locale.IsValid() ||
		utf8.RuneCountInString(tenantName) < 2 {
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

func (service *AuthService) EnsureSuperAdmin(
	ctx context.Context,
	rawEmail,
	password string,
	locale domain.Locale,
) error {
	email, err := domain.ParseEmail(rawEmail)
	if err != nil {
		return domain.NewError(domain.ErrorValidation)
	}

	locale = domain.NewLocale(string(locale))

	if !validPassword(password) ||
		!locale.IsValid() {
		return domain.NewError(domain.ErrorValidation)
	}

	passwordHash, err := service.passwords.Hash(password)
	if err != nil {
		return domain.NewError(domain.ErrorInternal)
	}

	return service.identities.EnsureSuperAdmin(
		ctx,
		domain.SuperAdminBootstrap{
			Email:        email,
			PasswordHash: passwordHash,
			Locale:       locale,
		},
	)
}

func (service *AuthService) CurrentSession(
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

	return service.sessionForUser(
		ctx,
		user,
		claim.ActiveTenantID,
	)
}

func (service *AuthService) Logout(
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

func (service *AuthService) SwitchTenant(
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

	if session.User.IsSuperAdmin {
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

	session, err = service.issue(session)
	if err != nil {
		return domain.Session{}, err
	}

	if err := service.appendAudit(
		ctx,
		session.User.ID,
		new(requestedTenantID),
		"tenant.switch",
		membership.Tenant.Name,
	); err != nil {
		return domain.Session{}, err
	}

	return session, nil
}

func (service *AuthService) login(
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

	user, passwordHash, findErr :=
		service.identities.FindByEmail(
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

	if requireSuperAdmin != user.IsSuperAdmin {
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
	return utf8.ValidString(password) &&
		utf8.RuneCountInString(password) >=
			minimumPasswordCharacters &&
		len(password) <= maximumPasswordBytes
}
