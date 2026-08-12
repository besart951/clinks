package service

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type AuthServices struct {
	Credentials        *CredentialService
	Sessions           *SessionService
	Invitations        *InvitationService
	ExternalIdentities *ExternalIdentityService
}

type CredentialService struct {
	auth *authService
}

type SessionService struct {
	auth *authService
}

type InvitationService struct {
	auth *authService
}

type ExternalIdentityService struct {
	auth *authService
}

func NewAuthServices(dependencies AuthDependencies) (AuthServices, error) {
	auth, err := newAuthService(dependencies)
	if err != nil {
		return AuthServices{}, err
	}
	return AuthServices{
		Credentials:        &CredentialService{auth: auth},
		Sessions:           &SessionService{auth: auth},
		Invitations:        &InvitationService{auth: auth},
		ExternalIdentities: &ExternalIdentityService{auth: auth},
	}, nil
}

func (service *CredentialService) Login(
	ctx context.Context,
	email,
	password string,
) (domain.Session, error) {
	return service.auth.Login(ctx, email, password)
}

func (service *CredentialService) LoginSuperAdmin(
	ctx context.Context,
	email,
	password string,
) (domain.Session, error) {
	return service.auth.LoginSuperAdmin(ctx, email, password)
}

func (service *CredentialService) Register(
	ctx context.Context,
	email,
	password,
	tenantName string,
	locale domain.Locale,
) (domain.Session, error) {
	return service.auth.Register(ctx, email, password, tenantName, locale)
}

func (service *SessionService) Logout(ctx context.Context, token string) error {
	return service.auth.Logout(ctx, token)
}

func (service *SessionService) CurrentSession(
	ctx context.Context,
	token string,
) (domain.Session, error) {
	return service.auth.CurrentSession(ctx, token)
}

func (service *SessionService) SwitchTenant(
	ctx context.Context,
	token string,
	tenantID domain.TenantID,
) (domain.Session, error) {
	return service.auth.SwitchTenant(ctx, token, tenantID)
}

func (service *InvitationService) CreateInvitation(
	ctx context.Context,
	token,
	email string,
	roleID domain.RoleID,
) (domain.Invitation, error) {
	return service.auth.CreateInvitation(ctx, token, email, roleID)
}

func (service *InvitationService) AcceptInvitation(
	ctx context.Context,
	token,
	email,
	password string,
	locale domain.Locale,
) (domain.Session, error) {
	return service.auth.AcceptInvitation(ctx, token, email, password, locale)
}

func (service *ExternalIdentityService) LoginExternal(
	ctx context.Context,
	identity domain.ExternalIdentity,
) (domain.Session, error) {
	return service.auth.LoginExternal(ctx, identity)
}

func (service *ExternalIdentityService) LinkExternalIdentity(
	ctx context.Context,
	token string,
	identity domain.ExternalIdentity,
) error {
	return service.auth.LinkExternalIdentity(ctx, token, identity)
}

func (service *ExternalIdentityService) AcceptExternalInvitation(
	ctx context.Context,
	token string,
	identity domain.ExternalIdentity,
	locale domain.Locale,
) (domain.Session, error) {
	return service.auth.AcceptExternalInvitation(ctx, token, identity, locale)
}
