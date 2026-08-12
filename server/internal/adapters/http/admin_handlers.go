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

func (server *Server) ListTenants(ctx context.Context, request *connect.Request[clinksv1.ListTenantsRequest]) (*connect.Response[clinksv1.ListTenantsResponse], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}

	sort, validSort := tenantSort(request.Msg.GetSort())
	direction, validDirection := sortDirection(request.Msg.GetDirection(), domain.SortAscending)
	if !validSort || !validDirection {
		return nil, server.localizedError(ctx, request.Header(), domain.NewError(domain.ErrorValidation))
	}
	page, err := server.tenants.Tenants(ctx, domain.TenantFilter{
		Search: request.Msg.GetSearch(), Sort: sort, Direction: direction,
		Cursor: domain.Cursor(request.Msg.GetCursor()), Limit: int(request.Msg.GetPageSize()),
	})
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.ListTenantsResponse{
		Tenants: tenantMessages(page.Items), NextCursor: string(page.NextCursor),
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

func (server *Server) UpdateTenant(ctx context.Context, request *connect.Request[clinksv1.UpdateTenantRequest]) (*connect.Response[clinksv1.Tenant], error) {
	user, err := server.authorizeSuperAdmin(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	tenant, err := server.tenants.UpdateTenant(ctx, domain.Tenant{
		ID:       domain.TenantID(request.Msg.GetTenantId()),
		Name:     request.Msg.GetName(),
		Revision: request.Msg.GetRevision(),
	}, user.ID)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(tenantMessage(tenant)), nil
}

func (server *Server) ListManagedLanguages(ctx context.Context, request *connect.Request[clinksv1.ListLanguagesRequest]) (*connect.Response[clinksv1.ListLanguagesResponse], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}

	sort, validSort := languageSort(request.Msg.GetSort())
	direction, validDirection := sortDirection(request.Msg.GetDirection(), domain.SortAscending)
	if !validSort || !validDirection {
		return nil, server.localizedError(ctx, request.Header(), domain.NewError(domain.ErrorValidation))
	}
	filter := domain.LanguageFilter{
		Search: request.Msg.GetSearch(), Sort: sort, Direction: direction,
		Cursor: domain.Cursor(request.Msg.GetCursor()), Limit: int(request.Msg.GetPageSize()),
	}
	if request.Msg.Active != nil {
		filter.Active = new(request.Msg.GetActive())
	}
	page, err := server.localizationEdit.Languages(ctx, filter)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.ListLanguagesResponse{
		Languages: languageMessages(page.Items), NextCursor: string(page.NextCursor),
	}), nil
}

func (server *Server) CreateLanguage(ctx context.Context, request *connect.Request[clinksv1.CreateLanguageRequest]) (*connect.Response[clinksv1.Language], error) {
	user, err := server.authorizeSuperAdmin(ctx, request.Header())
	if err != nil {
		return nil, err
	}

	language := domain.Language{
		Code:     domain.NewLocale(request.Msg.GetCode()),
		Name:     request.Msg.GetName(),
		IsActive: request.Msg.GetIsActive(),
	}

	language, err = server.localizationEdit.SaveLanguage(ctx, language, user.ID)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(languageMessages([]domain.Language{language})[0]), nil
}

func (server *Server) UpdateLanguage(ctx context.Context, request *connect.Request[clinksv1.UpdateLanguageRequest]) (*connect.Response[clinksv1.Language], error) {
	user, err := server.authorizeSuperAdmin(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	language := domain.Language{
		Code:     domain.NewLocale(request.Msg.GetCode()),
		Name:     request.Msg.GetName(),
		IsActive: request.Msg.GetIsActive(),
		Revision: request.Msg.GetRevision(),
	}
	language, err = server.localizationEdit.SaveLanguage(ctx, language, user.ID)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(languageMessages([]domain.Language{language})[0]), nil
}

func (server *Server) UpsertTranslationOverride(ctx context.Context, request *connect.Request[clinksv1.UpsertTranslationOverrideRequest]) (*connect.Response[clinksv1.TranslationOverride], error) {
	user, err := server.authorizeSuperAdmin(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	override := request.Msg.GetOverride()
	if override == nil {
		return nil, server.localizedError(ctx, request.Header(), domain.NewError(domain.ErrorValidation))
	}

	scope, err := domain.ParseApplicationScope(override.GetApplicationScope())
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	translation := domain.Translation{
		Locale:           domain.NewLocale(override.GetLocale()),
		ApplicationScope: scope,
		Key:              override.GetKey(),
		Value:            override.GetValue(),
		Revision:         override.GetRevision(),
	}

	translation, err = server.localizationEdit.SaveTranslationOverride(ctx, translation, user.ID)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(translationOverrideMessage(translation)), nil
}

func (server *Server) ListAuditEvents(ctx context.Context, request *connect.Request[clinksv1.ListAuditEventsRequest]) (*connect.Response[clinksv1.ListAuditEventsResponse], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}
	direction, validDirection := sortDirection(request.Msg.GetDirection(), domain.SortDescending)
	if (request.Msg.GetSort() != clinksv1.AuditSort_AUDIT_SORT_UNSPECIFIED && request.Msg.GetSort() != clinksv1.AuditSort_AUDIT_SORT_OCCURRED_AT) || !validDirection {
		return nil, server.localizedError(ctx, request.Header(), domain.NewError(domain.ErrorValidation))
	}

	filter, err := auditFilter(request.Msg)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	filter.Direction = direction

	page, err := server.audit.AuditEvents(ctx, &filter)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.ListAuditEventsResponse{
		Events:     server.auditMessages(ctx, request.Header(), page.Events),
		NextCursor: string(page.NextCursor),
	}), nil
}

func (server *Server) ListUsers(ctx context.Context, request *connect.Request[clinksv1.ListUsersRequest]) (*connect.Response[clinksv1.ListUsersResponse], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}
	sort, validSort := userSort(request.Msg.GetSort())
	direction, validDirection := sortDirection(request.Msg.GetDirection(), domain.SortAscending)
	if !validSort || !validDirection {
		return nil, server.localizedError(ctx, request.Header(), domain.NewError(domain.ErrorValidation))
	}

	filter := domain.UserFilter{
		Search: request.Msg.GetSearch(),
		Sort:   sort, Direction: direction,
		Cursor: domain.Cursor(request.Msg.GetCursor()),
		Limit:  int(request.Msg.GetPageSize()),
	}
	if role := request.Msg.GetGlobalRole(); role != clinksv1.GlobalRole_GLOBAL_ROLE_UNSPECIFIED {
		globalRole := domainGlobalRole(role)
		filter.GlobalRole = new(globalRole)
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

	return connect.NewResponse(userDetailMessage(detail)), nil
}

func (server *Server) ListInvitations(ctx context.Context, request *connect.Request[clinksv1.ListInvitationsRequest]) (*connect.Response[clinksv1.ListInvitationsResponse], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}
	sort, validSort := invitationSort(request.Msg.GetSort())
	direction, validDirection := sortDirection(request.Msg.GetDirection(), domain.SortDescending)
	if !validSort || !validDirection {
		return nil, server.localizedError(ctx, request.Header(), domain.NewError(domain.ErrorValidation))
	}

	filter := domain.InvitationFilter{
		Search: request.Msg.GetSearch(),
		Status: domainInvitationStatus(request.Msg.GetStatus()),
		Sort:   sort, Direction: direction,
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
		messages[i] = invitationMessage(page.Items[i])
	}

	return connect.NewResponse(&clinksv1.ListInvitationsResponse{
		Invitations: messages,
		NextCursor:  string(page.NextCursor),
	}), nil
}

func (server *Server) RevokeInvitation(ctx context.Context, request *connect.Request[clinksv1.RevokeInvitationRequest]) (*connect.Response[clinksv1.Empty], error) {
	user, err := server.authorizeSuperAdmin(ctx, request.Header())
	if err != nil {
		return nil, err
	}

	if err := server.inviteAdmin.RevokeInvitation(ctx, domain.InvitationID(request.Msg.GetInvitationId()), user.ID); err != nil {
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
