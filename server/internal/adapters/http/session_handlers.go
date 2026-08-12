package http

import (
	"context"
	"errors"
	stdhttp "net/http"
	"strings"

	"connectrpc.com/connect"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
)

func (server *Server) Login(
	ctx context.Context,
	request *connect.Request[clinksv1.CredentialsRequest],
) (*connect.Response[clinksv1.Session], error) {
	return server.loginWithCredentials(ctx, request, "user", server.sessions.Login, true)
}

func (server *Server) LoginSuperAdmin(
	ctx context.Context,
	request *connect.Request[clinksv1.CredentialsRequest],
) (*connect.Response[clinksv1.Session], error) {
	return server.loginWithCredentials(ctx, request, "superadmin", server.sessions.LoginSuperAdmin, false)
}

func (server *Server) Register(
	ctx context.Context,
	request *connect.Request[clinksv1.RegisterRequest],
) (*connect.Response[clinksv1.Session], error) {
	session, err := server.registration.Register(
		ctx,
		request.Msg.GetEmail(),
		request.Msg.GetPassword(),
		request.Msg.GetTenantName(),
		requestLocale(request.Header()),
	)

	return server.sessionResponse(ctx, request.Header(), session, err)
}

func (server *Server) Logout(
	ctx context.Context,
	request *connect.Request[clinksv1.Empty],
) (*connect.Response[clinksv1.Empty], error) {
	session, err := requireSession(ctx)
	if err == nil {
		err = server.sessions.Logout(ctx, session.Token)
	}
	if err != nil && !isSessionInvalid(err) {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	response := connect.NewResponse(&clinksv1.Empty{})
	response.Header().Add("Set-Cookie", server.sessionCookie("").String())
	if server.oidcStateSecret != "" {
		response.Header().Add("Set-Cookie", server.passwordVerifiedCookie("").String())
	}

	return response, nil
}

func (server *Server) GetSession(
	ctx context.Context,
	request *connect.Request[clinksv1.Empty],
) (*connect.Response[clinksv1.Session], error) {
	session, err := server.authenticateSession(ctx, request.Header())
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(sessionMessage(session)), nil
}

func (server *Server) SwitchTenant(
	ctx context.Context,
	request *connect.Request[clinksv1.SwitchTenantRequest],
) (*connect.Response[clinksv1.Session], error) {
	session, err := server.authenticateSession(ctx, request.Header())
	if err != nil {
		return nil, err
	}

	switchedSession, err := server.sessions.SwitchTenant(
		ctx,
		session.Token,
		domain.TenantID(request.Msg.GetTenantId()),
	)

	return server.sessionResponse(ctx, request.Header(), switchedSession, err)
}

func (server *Server) CreateInvitation(
	ctx context.Context,
	request *connect.Request[clinksv1.CreateInvitationRequest],
) (*connect.Response[clinksv1.Invitation], error) {
	session, err := server.authenticateSession(ctx, request.Header())
	if err != nil {
		return nil, err
	}

	invitation, err := server.invitations.CreateInvitation(
		ctx,
		session.Token,
		request.Msg.GetEmail(),
		domain.Role(request.Msg.GetRole()),
	)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(invitationMessage(&invitation)), nil
}

func (server *Server) AcceptInvitation(
	ctx context.Context,
	request *connect.Request[clinksv1.AcceptInvitationRequest],
) (*connect.Response[clinksv1.Session], error) {
	session, err := server.invitations.AcceptInvitation(
		ctx,
		request.Msg.GetToken(),
		request.Msg.GetEmail(),
		request.Msg.GetPassword(),
		requestLocale(request.Header()),
	)

	return server.sessionResponse(ctx, request.Header(), session, err)
}

type loginFn func(context.Context, string, string) (domain.Session, error)

func (server *Server) loginWithCredentials(
	ctx context.Context,
	request *connect.Request[clinksv1.CredentialsRequest],
	scope string,
	login loginFn,
	setVerifiedCookie bool,
) (*connect.Response[clinksv1.Session], error) {
	email := request.Msg.GetEmail()
	limiterKey := passwordRateLimitKey(scope, email)

	allowed, retryAfter := server.authLimiter.allow(limiterKey)
	if !allowed {
		return nil, rateLimitError(request.Header(), retryAfter)
	}

	session, err := login(ctx, email, request.Msg.GetPassword())
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	server.authLimiter.reset(limiterKey)

	response, err := server.sessionResponse(ctx, request.Header(), session, nil)
	if err != nil {
		return nil, err
	}

	if setVerifiedCookie && server.oidcStateSecret != "" {
		response.Header().Add("Set-Cookie", server.passwordVerifiedCookie(session.Token).String())
	}

	return response, nil
}

func passwordRateLimitKey(scope, email string) string {
	return "password:" + scope + ":" + strings.ToLower(strings.TrimSpace(email))
}

func (server *Server) authenticateSession(
	ctx context.Context,
	header stdhttp.Header,
) (*domain.Session, error) {
	session, err := requireSession(ctx)
	if err != nil {
		return nil, server.localizedError(ctx, header, err)
	}

	return &session, nil
}

func isSessionInvalid(err error) bool {
	domainError, ok := errors.AsType[*domain.Error](err)
	if !ok {
		return false
	}

	return domainError.Kind == domain.ErrorUnauthorized ||
		domainError.Kind == domain.ErrorInvalidCredentials
}
