package http

import (
	"context"

	"connectrpc.com/connect"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
)

func (server *Server) UpdateCurrentTenant(
	ctx context.Context,
	request *connect.Request[clinksv1.UpdateCurrentTenantRequest],
) (*connect.Response[clinksv1.Tenant], error) {
	session, err := server.authenticateSession(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	tenant, err := server.tenantManagement.UpdateCurrentTenant(
		ctx, *session, request.Msg.GetName(), request.Msg.GetRevision(),
	)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(tenantMessage(tenant)), nil
}

func (server *Server) ListMemberships(
	ctx context.Context,
	request *connect.Request[clinksv1.ListMembershipsRequest],
) (*connect.Response[clinksv1.ListMembershipsResponse], error) {
	session, err := server.authenticateSession(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	sort, validSort := membershipSort(request.Msg.GetSort())
	direction, validDirection := sortDirection(request.Msg.GetDirection(), domain.SortAscending)
	if !validSort || !validDirection {
		return nil, server.localizedError(ctx, request.Header(), domain.NewError(domain.ErrorValidation))
	}
	filter := domain.MembershipFilter{
		Search: request.Msg.GetSearch(), Sort: sort, Direction: direction,
		Cursor: domain.Cursor(request.Msg.GetCursor()), Limit: int(request.Msg.GetPageSize()),
	}
	if roleID := request.Msg.GetRoleId(); roleID != "" {
		value := domain.RoleID(roleID)
		filter.RoleID = &value
	}
	if request.Msg.GetStatus() != clinksv1.MembershipStatus_MEMBERSHIP_STATUS_UNSPECIFIED {
		value := domainMembershipStatus(request.Msg.GetStatus())
		filter.Status = &value
	}
	page, err := server.tenantManagement.ListMemberships(ctx, *session, filter)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(&clinksv1.ListMembershipsResponse{
		Memberships: membershipMessages(page.Items), NextCursor: string(page.NextCursor),
	}), nil
}

func (server *Server) UpdateMembership(
	ctx context.Context,
	request *connect.Request[clinksv1.UpdateMembershipRequest],
) (*connect.Response[clinksv1.Membership], error) {
	session, err := server.authenticateSession(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	membership := domain.Membership{
		ID:       domain.MembershipID(request.Msg.GetMembershipId()),
		RoleID:   domain.RoleID(request.Msg.GetRoleId()),
		Status:   domainMembershipStatus(request.Msg.GetStatus()),
		Revision: request.Msg.GetRevision(),
	}
	membership, err = server.tenantManagement.UpdateMembership(ctx, *session, membership)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(membershipMessages([]domain.Membership{membership})[0]), nil
}

func (server *Server) ListRoles(
	ctx context.Context,
	request *connect.Request[clinksv1.ListRolesRequest],
) (*connect.Response[clinksv1.ListRolesResponse], error) {
	session, err := server.authenticateSession(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	sort, validSort := roleSort(request.Msg.GetSort())
	direction, validDirection := sortDirection(request.Msg.GetDirection(), domain.SortAscending)
	if !validSort || !validDirection {
		return nil, server.localizedError(ctx, request.Header(), domain.NewError(domain.ErrorValidation))
	}
	filter := domain.RoleFilter{
		Search: request.Msg.GetSearch(), Sort: sort, Direction: direction,
		Cursor: domain.Cursor(request.Msg.GetCursor()), Limit: int(request.Msg.GetPageSize()),
	}
	if request.Msg.GetKind() != clinksv1.RoleKind_ROLE_KIND_UNSPECIFIED {
		value := domainRoleKind(request.Msg.GetKind())
		filter.Kind = &value
	}
	page, err := server.tenantManagement.ListRoles(ctx, *session, filter)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	messages := make([]*clinksv1.Role, len(page.Items))
	for index, role := range page.Items {
		messages[index] = roleMessage(role)
	}
	return connect.NewResponse(&clinksv1.ListRolesResponse{Roles: messages, NextCursor: string(page.NextCursor)}), nil
}

func (server *Server) CreateRole(ctx context.Context, request *connect.Request[clinksv1.CreateRoleRequest]) (*connect.Response[clinksv1.Role], error) {
	session, err := server.authenticateSession(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	role, err := server.tenantManagement.CreateRole(ctx, *session, request.Msg.GetName(), domainPermissions(request.Msg.GetPermissions()))
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(roleMessage(role)), nil
}

func (server *Server) UpdateRole(ctx context.Context, request *connect.Request[clinksv1.UpdateRoleRequest]) (*connect.Response[clinksv1.Role], error) {
	session, err := server.authenticateSession(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	role, err := server.tenantManagement.UpdateRole(ctx, *session, domain.Role{
		ID: domain.RoleID(request.Msg.GetRoleId()), Name: request.Msg.GetName(),
		Permissions: domainPermissions(request.Msg.GetPermissions()), Revision: request.Msg.GetRevision(),
	})
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(roleMessage(role)), nil
}

func (server *Server) DeleteRole(ctx context.Context, request *connect.Request[clinksv1.DeleteRoleRequest]) (*connect.Response[clinksv1.Empty], error) {
	session, err := server.authenticateSession(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	if err := server.tenantManagement.DeleteRole(ctx, *session, domain.RoleID(request.Msg.GetRoleId()), request.Msg.GetRevision()); err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(&clinksv1.Empty{}), nil
}

func (server *Server) ListTenantInvitations(
	ctx context.Context,
	request *connect.Request[clinksv1.ListTenantInvitationsRequest],
) (*connect.Response[clinksv1.ListInvitationsResponse], error) {
	session, err := server.authenticateSession(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	sort, validSort := invitationSort(request.Msg.GetSort())
	direction, validDirection := sortDirection(request.Msg.GetDirection(), domain.SortDescending)
	if !validSort || !validDirection {
		return nil, server.localizedError(ctx, request.Header(), domain.NewError(domain.ErrorValidation))
	}
	page, err := server.tenantManagement.ListInvitations(ctx, *session, domain.InvitationFilter{
		Search: request.Msg.GetSearch(), Status: domainInvitationStatus(request.Msg.GetStatus()),
		Sort: sort, Direction: direction,
		Cursor: domain.Cursor(request.Msg.GetCursor()), Limit: int(request.Msg.GetPageSize()),
	})
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	messages := make([]*clinksv1.Invitation, len(page.Items))
	for index := range page.Items {
		messages[index] = invitationMessage(page.Items[index])
	}
	return connect.NewResponse(&clinksv1.ListInvitationsResponse{Invitations: messages, NextCursor: string(page.NextCursor)}), nil
}

func (server *Server) RevokeTenantInvitation(
	ctx context.Context,
	request *connect.Request[clinksv1.RevokeInvitationRequest],
) (*connect.Response[clinksv1.Empty], error) {
	session, err := server.authenticateSession(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	if err := server.tenantManagement.RevokeInvitation(ctx, *session, domain.InvitationID(request.Msg.GetInvitationId())); err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(&clinksv1.Empty{}), nil
}

func roleMessage(role domain.Role) *clinksv1.Role {
	summary := roleSummaryMessage(role)
	return &clinksv1.Role{
		Id: summary.Id, TenantId: string(role.TenantID), Name: summary.Name,
		Kind: summary.Kind, Permissions: summary.Permissions, Revision: summary.Revision,
		CreatedAt: role.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt: role.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
	}
}

func domainPermissions(values []string) []domain.Permission {
	permissions := make([]domain.Permission, len(values))
	for index, value := range values {
		permissions[index] = domain.Permission(value)
	}
	return permissions
}

func domainMembershipStatus(status clinksv1.MembershipStatus) domain.MembershipStatus {
	if status == clinksv1.MembershipStatus_MEMBERSHIP_STATUS_ACTIVE {
		return domain.MembershipActive
	}
	if status == clinksv1.MembershipStatus_MEMBERSHIP_STATUS_INACTIVE {
		return domain.MembershipInactive
	}
	return ""
}

func domainRoleKind(kind clinksv1.RoleKind) domain.RoleKind {
	switch kind {
	case clinksv1.RoleKind_ROLE_KIND_ADMINISTRATOR:
		return domain.RoleKindAdministrator
	case clinksv1.RoleKind_ROLE_KIND_USER:
		return domain.RoleKindUser
	case clinksv1.RoleKind_ROLE_KIND_CUSTOM:
		return domain.RoleKindCustom
	default:
		return ""
	}
}
