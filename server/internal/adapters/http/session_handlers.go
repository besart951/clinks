package http

import (
	"context"
	"errors"

	"connectrpc.com/connect"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
)

func (server *Server) Login(ctx context.Context, request *connect.Request[clinksv1.CredentialsRequest]) (*connect.Response[clinksv1.Session], error) {
	if !server.authLimiter.allow("password:" + request.Msg.GetEmail()) {
		return server.sessionResponse(ctx, request.Header(), new(domain.Session), domain.NewError(domain.ErrorUnauthorized))
	}
	session, err := server.sessions.Login(ctx, request.Msg.GetEmail(), request.Msg.GetPassword())
	response, responseErr := server.sessionResponse(ctx, request.Header(), &session, err)
	if responseErr == nil && server.oidcStateSecret != "" {
		response.Header().Add("Set-Cookie", server.passwordVerifiedCookie(session.Token).String())
	}
	return response, responseErr
}

func (server *Server) LoginSuperAdmin(ctx context.Context, request *connect.Request[clinksv1.CredentialsRequest]) (*connect.Response[clinksv1.Session], error) {
	if !server.authLimiter.allow("password:" + request.Msg.GetEmail()) {
		return server.sessionResponse(ctx, request.Header(), new(domain.Session), domain.NewError(domain.ErrorUnauthorized))
	}
	session, err := server.sessions.LoginSuperAdmin(ctx, request.Msg.GetEmail(), request.Msg.GetPassword())
	return server.sessionResponse(ctx, request.Header(), &session, err)
}

func (server *Server) Register(ctx context.Context, request *connect.Request[clinksv1.RegisterRequest]) (*connect.Response[clinksv1.Session], error) {
	session, err := server.registration.Register(ctx, request.Msg.GetEmail(), request.Msg.GetPassword(), request.Msg.GetTenantName(), requestLocale(request.Header()))
	return server.sessionResponse(ctx, request.Header(), &session, err)
}

func (server *Server) Logout(ctx context.Context, request *connect.Request[clinksv1.Empty]) (*connect.Response[clinksv1.Empty], error) {
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

func isSessionInvalid(err error) bool {
	var domainError *domain.Error
	return errors.As(err, &domainError) && (domainError.Kind == domain.ErrorUnauthorized || domainError.Kind == domain.ErrorInvalidCredentials)
}

func (server *Server) GetSession(ctx context.Context, request *connect.Request[clinksv1.Empty]) (*connect.Response[clinksv1.Session], error) {
	session, err := requireSession(ctx)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(sessionMessage(&session)), nil
}

func (server *Server) SwitchTenant(ctx context.Context, request *connect.Request[clinksv1.SwitchTenantRequest]) (*connect.Response[clinksv1.Session], error) {
	session, err := requireSession(ctx)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	session, err = server.sessions.SwitchTenant(ctx, session.Token, domain.TenantID(request.Msg.GetTenantId()))
	return server.sessionResponse(ctx, request.Header(), &session, err)
}

func (server *Server) CreateInvitation(ctx context.Context, request *connect.Request[clinksv1.CreateInvitationRequest]) (*connect.Response[clinksv1.Invitation], error) {
	session, err := requireSession(ctx)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	invitation, err := server.invitations.CreateInvitation(ctx, session.Token, request.Msg.GetEmail(), domain.Role(request.Msg.GetRole()))
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(invitationMessage(&invitation)), nil
}

func (server *Server) AcceptInvitation(ctx context.Context, request *connect.Request[clinksv1.AcceptInvitationRequest]) (*connect.Response[clinksv1.Session], error) {
	session, err := server.invitations.AcceptInvitation(ctx, request.Msg.GetToken(), request.Msg.GetEmail(), request.Msg.GetPassword(), requestLocale(request.Header()))
	return server.sessionResponse(ctx, request.Header(), &session, err)
}
