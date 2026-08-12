package http

import (
	"context"
	stdhttp "net/http"

	"connectrpc.com/connect"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
)

// --- Helper ---

func (server *Server) authorizeSuperAdmin(ctx context.Context, header stdhttp.Header) (domain.User, error) {
	user, err := requireSuperAdmin(ctx)
	if err != nil {
		return domain.User{}, server.localizedError(ctx, header, err)
	}
	return user, nil
}

func (server *Server) ListTenants(ctx context.Context, request *connect.Request[clinksv1.Empty]) (*connect.Response[clinksv1.TenantsResponse], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}

	tenants, err := server.tenants.Tenants(ctx)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.TenantsResponse{
		Tenants: tenantMessages(tenants),
	}), nil
}

func (server *Server) CreateTenant(ctx context.Context, request *connect.Request[clinksv1.CreateTenantRequest]) (*connect.Response[clinksv1.Tenant], error) {
	user, err := server.authorizeSuperAdmin(ctx, request.Header())
	if err != nil {
		return nil, err
	}

	tenant, err := server.tenants.CreateTenant(ctx, request.Msg.GetName(), user.ID)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(tenantMessage(tenant)), nil
}

func (server *Server) ListManagedLanguages(ctx context.Context, request *connect.Request[clinksv1.Empty]) (*connect.Response[clinksv1.LanguagesResponse], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}

	languages, err := server.localizationEdit.Languages(ctx)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.LanguagesResponse{
		Languages: languageMessages(languages),
	}), nil
}

func (server *Server) SaveLanguage(ctx context.Context, request *connect.Request[clinksv1.Language]) (*connect.Response[clinksv1.Empty], error) {
	user, err := server.authorizeSuperAdmin(ctx, request.Header())
	if err != nil {
		return nil, err
	}

	language := domain.Language{
		Code:      domain.NewLocale(request.Msg.GetCode()),
		Name:      request.Msg.GetName(),
		IsDefault: request.Msg.GetIsDefault(),
		IsActive:  request.Msg.GetIsActive(),
	}

	if err := server.localizationEdit.SaveLanguage(ctx, language, user.ID); err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.Empty{}), nil
}

func (server *Server) SaveTranslation(ctx context.Context, request *connect.Request[clinksv1.ScopedTranslation]) (*connect.Response[clinksv1.Empty], error) {
	user, err := server.authorizeSuperAdmin(ctx, request.Header())
	if err != nil {
		return nil, err
	}

	scope, err := domain.ParseApplicationScope(request.Msg.GetApplicationScope())
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	translation := domain.Translation{
		Locale:           domain.NewLocale(request.Msg.GetLocale()),
		ApplicationScope: scope,
		Key:              request.Msg.GetKey(),
		Value:            request.Msg.GetValue(),
	}

	if err := server.localizationEdit.SaveTranslationOverride(ctx, translation, user.ID); err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.Empty{}), nil
}

func (server *Server) ListAuditEvents(ctx context.Context, request *connect.Request[clinksv1.ListAuditEventsRequest]) (*connect.Response[clinksv1.AuditEventsResponse], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}

	filter, err := auditFilter(request.Msg)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	page, err := server.audit.AuditEvents(ctx, &filter)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.AuditEventsResponse{
		Events:     server.auditMessages(ctx, request.Header(), page.Events),
		NextCursor: string(page.NextCursor),
	}), nil
}

func (server *Server) ListUsers(ctx context.Context, request *connect.Request[clinksv1.ListUsersRequest]) (*connect.Response[clinksv1.ListUsersResponse], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}

	filter := domain.UserFilter{
		Search: request.Msg.GetSearch(),
		Cursor: domain.Cursor(request.Msg.GetCursor()),
		Limit:  int(request.Msg.GetPageSize()),
	}
	if role := request.Msg.GetRole(); role != "" {
		filter.Role = new(domain.Role(role))
	}

	page, err := server.users.ListUsers(ctx, filter)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.ListUsersResponse{
		Users:      userSummaryMessages(page.Items),
		NextCursor: string(page.NextCursor),
	}), nil
}

func (server *Server) GetUser(ctx context.Context, request *connect.Request[clinksv1.GetUserRequest]) (*connect.Response[clinksv1.UserDetail], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}

	detail, err := server.users.GetUser(ctx, domain.UserID(request.Msg.GetUserId()))
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(userDetailMessage(&detail)), nil
}

func (server *Server) ListInvitations(ctx context.Context, request *connect.Request[clinksv1.ListInvitationsRequest]) (*connect.Response[clinksv1.ListInvitationsResponse], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}

	filter := domain.InvitationFilter{
		Search: request.Msg.GetSearch(),
		Status: request.Msg.GetStatus(),
		Cursor: domain.Cursor(request.Msg.GetCursor()),
		Limit:  int(request.Msg.GetPageSize()),
	}
	if tenantID := request.Msg.GetTenantId(); tenantID != "" {
		filter.TenantID = new(domain.TenantID(tenantID))
	}

	page, err := server.inviteAdmin.ListInvitations(ctx, filter)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	messages := make([]*clinksv1.Invitation, len(page.Items))
	for i := range page.Items {
		messages[i] = invitationMessage(&page.Items[i])
	}

	return connect.NewResponse(&clinksv1.ListInvitationsResponse{
		Invitations: messages,
		NextCursor:  string(page.NextCursor),
	}), nil
}

func (server *Server) RevokeInvitation(ctx context.Context, request *connect.Request[clinksv1.RevokeInvitationRequest]) (*connect.Response[clinksv1.Empty], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}

	if err := server.inviteAdmin.RevokeInvitation(ctx, domain.InvitationID(request.Msg.GetInvitationId())); err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.Empty{}), nil
}

func (server *Server) GetSystemStats(ctx context.Context, request *connect.Request[clinksv1.Empty]) (*connect.Response[clinksv1.SystemStats], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}

	stats, err := server.overview.Stats(ctx)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.SystemStats{
		UserCount:              uint32(stats.UserCount),              //nolint:gosec // count fits in uint32
		TenantCount:            uint32(stats.TenantCount),            //nolint:gosec // count fits in uint32
		PendingInvitationCount: uint32(stats.PendingInvitationCount), //nolint:gosec // count fits in uint32
		ActiveLanguageCount:    uint32(stats.ActiveLanguageCount),    //nolint:gosec // count fits in uint32
	}), nil
}
