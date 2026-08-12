package clinks

import (
	"context"
	"slices"
)

// TenantAccess owns tenant-control-plane behavior. Callers provide the
// current, freshly resolved session; authorization is rechecked at each use.
type TenantAccess struct {
	tenants     TenantEditor
	memberships MembershipManager
	roles       RoleStore
	invitations InvitationAdminStore
}

func NewTenantAccess(
	tenants TenantEditor,
	memberships MembershipManager,
	roles RoleStore,
	invitations InvitationAdminStore,
) *TenantAccess {
	return &TenantAccess{tenants: tenants, memberships: memberships, roles: roles, invitations: invitations}
}

func (management *TenantAccess) UpdateCurrentTenant(
	ctx context.Context,
	session Session,
	name string,
	revision uint64,
) (Tenant, error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return Tenant{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, PermissionTenantManage); err != nil {
		return Tenant{}, err
	}
	name, err = NormalizeTenantName(name)
	if err != nil || revision == 0 {
		return Tenant{}, NewError(ErrorValidation)
	}
	tenant.Name = name
	tenant.Revision = revision
	return management.tenants.UpdateTenant(ctx, tenant, session.User.ID)
}

func (management *TenantAccess) ListMemberships(
	ctx context.Context,
	session Session,
	filter MembershipFilter,
) (Page[Membership], error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return Page[Membership]{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, PermissionUserRead); err != nil {
		return Page[Membership]{}, err
	}
	filter, err = filter.Normalized()
	if err != nil {
		return Page[Membership]{}, err
	}
	return management.memberships.ListMemberships(ctx, tenant.ID, filter)
}

func (management *TenantAccess) UpdateMembership(
	ctx context.Context,
	session Session,
	membership Membership,
) (Membership, error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return Membership{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, PermissionUserManage); err != nil {
		return Membership{}, err
	}
	if !membership.ID.IsValid() || !membership.RoleID.IsValid() ||
		!membership.Status.IsValid() || membership.Revision == 0 {
		return Membership{}, NewError(ErrorValidation)
	}
	membership.Tenant = tenant
	return management.memberships.UpdateMembership(ctx, membership, session.User.ID)
}

func (management *TenantAccess) ListRoles(
	ctx context.Context,
	session Session,
	filter RoleFilter,
) (Page[Role], error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return Page[Role]{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, PermissionRoleRead); err != nil {
		return Page[Role]{}, err
	}
	filter, err = filter.Normalized()
	if err != nil {
		return Page[Role]{}, err
	}
	return management.roles.ListRoles(ctx, tenant.ID, filter)
}

func (management *TenantAccess) CreateRole(
	ctx context.Context,
	session Session,
	name string,
	permissions []Permission,
) (Role, error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return Role{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, PermissionRoleManage); err != nil {
		return Role{}, err
	}
	name, err = NormalizeRoleName(name)
	if err != nil || !ValidPermissions(permissions) {
		return Role{}, NewError(ErrorValidation)
	}
	return management.roles.CreateRole(ctx, Role{
		TenantID: tenant.ID, Name: name, Kind: RoleKindCustom,
		Permissions: slices.Clone(permissions),
	}, session.User.ID)
}

func (management *TenantAccess) UpdateRole(
	ctx context.Context,
	session Session,
	role Role,
) (Role, error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return Role{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, PermissionRoleManage); err != nil {
		return Role{}, err
	}
	role.Name, err = NormalizeRoleName(role.Name)
	if err != nil || !role.ID.IsValid() || role.Revision == 0 || !ValidPermissions(role.Permissions) {
		return Role{}, NewError(ErrorValidation)
	}
	role.TenantID = tenant.ID
	current, err := management.roles.FindRole(ctx, tenant.ID, role.ID)
	if err != nil {
		return Role{}, err
	}
	if current.IsProtected() {
		return Role{}, NewError(ErrorConflict)
	}
	return management.roles.UpdateRole(ctx, role, session.User.ID)
}

func (management *TenantAccess) DeleteRole(
	ctx context.Context,
	session Session,
	roleID RoleID,
	revision uint64,
) error {
	tenant, err := activeTenant(session)
	if err != nil {
		return err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, PermissionRoleManage); err != nil {
		return err
	}
	if !roleID.IsValid() || revision == 0 {
		return NewError(ErrorValidation)
	}
	role, err := management.roles.FindRole(ctx, tenant.ID, roleID)
	if err != nil {
		return err
	}
	if role.IsProtected() {
		return NewError(ErrorConflict)
	}
	return management.roles.DeleteRole(ctx, tenant.ID, roleID, revision, session.User.ID)
}

func (management *TenantAccess) ListInvitations(
	ctx context.Context,
	session Session,
	filter InvitationFilter,
) (Page[Invitation], error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return Page[Invitation]{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, PermissionUserRead); err != nil {
		return Page[Invitation]{}, err
	}
	filter, err = filter.Normalized()
	if err != nil {
		return Page[Invitation]{}, err
	}
	return management.invitations.ListTenantInvitations(ctx, tenant.ID, filter)
}

func (management *TenantAccess) RevokeInvitation(
	ctx context.Context,
	session Session,
	id InvitationID,
) error {
	tenant, err := activeTenant(session)
	if err != nil {
		return err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, PermissionUserManage); err != nil {
		return err
	}
	if !id.IsValid() {
		return NewError(ErrorValidation)
	}
	return management.invitations.RevokeTenantInvitation(ctx, tenant.ID, id, session.User.ID)
}

func (management *TenantAccess) require(
	ctx context.Context,
	userID UserID,
	tenantID TenantID,
	permission Permission,
) error {
	membership, err := management.memberships.FindActiveMembership(ctx, userID, tenantID)
	if err != nil {
		return err
	}
	permissions, err := management.roles.PermissionsForRole(ctx, tenantID, membership.RoleID)
	if err != nil {
		return err
	}
	if !slices.Contains(permissions, permission) {
		return NewError(ErrorUnauthorized)
	}
	return nil
}

func activeTenant(session Session) (Tenant, error) {
	if session.ActiveTenant == nil || !session.ActiveTenant.ID.IsValid() || !session.User.ID.IsValid() {
		return Tenant{}, NewError(ErrorUnauthorized)
	}
	return *session.ActiveTenant, nil
}
