package service

import (
	"context"
	"slices"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

// TenantManagement owns tenant-control-plane behavior. Callers provide the
// current, freshly resolved session; authorization is rechecked at each use.
type TenantManagement struct {
	tenants     ports.TenantEditor
	memberships ports.MembershipManager
	roles       ports.RoleRepository
	invitations ports.InvitationAdministration
}

func NewTenantManagement(
	tenants ports.TenantEditor,
	memberships ports.MembershipManager,
	roles ports.RoleRepository,
	invitations ports.InvitationAdministration,
) *TenantManagement {
	return &TenantManagement{tenants: tenants, memberships: memberships, roles: roles, invitations: invitations}
}

func (management *TenantManagement) UpdateCurrentTenant(
	ctx context.Context,
	session domain.Session,
	name string,
	revision uint64,
) (domain.Tenant, error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return domain.Tenant{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, domain.PermissionTenantManage); err != nil {
		return domain.Tenant{}, err
	}
	name, err = domain.NormalizeTenantName(name)
	if err != nil || revision == 0 {
		return domain.Tenant{}, domain.NewError(domain.ErrorValidation)
	}
	tenant.Name = name
	tenant.Revision = revision
	return management.tenants.UpdateTenant(ctx, tenant, session.User.ID)
}

func (management *TenantManagement) ListMemberships(
	ctx context.Context,
	session domain.Session,
	filter domain.MembershipFilter,
) (domain.Page[domain.Membership], error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return domain.Page[domain.Membership]{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, domain.PermissionUserRead); err != nil {
		return domain.Page[domain.Membership]{}, err
	}
	filter, err = filter.Normalized()
	if err != nil {
		return domain.Page[domain.Membership]{}, err
	}
	return management.memberships.ListMemberships(ctx, tenant.ID, filter)
}

func (management *TenantManagement) UpdateMembership(
	ctx context.Context,
	session domain.Session,
	membership domain.Membership,
) (domain.Membership, error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return domain.Membership{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, domain.PermissionUserManage); err != nil {
		return domain.Membership{}, err
	}
	if !membership.ID.IsValid() || !membership.RoleID.IsValid() ||
		!membership.Status.IsValid() || membership.Revision == 0 {
		return domain.Membership{}, domain.NewError(domain.ErrorValidation)
	}
	membership.Tenant = tenant
	return management.memberships.UpdateMembership(ctx, membership, session.User.ID)
}

func (management *TenantManagement) ListRoles(
	ctx context.Context,
	session domain.Session,
	filter domain.RoleFilter,
) (domain.Page[domain.Role], error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return domain.Page[domain.Role]{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, domain.PermissionRoleRead); err != nil {
		return domain.Page[domain.Role]{}, err
	}
	filter, err = filter.Normalized()
	if err != nil {
		return domain.Page[domain.Role]{}, err
	}
	return management.roles.ListRoles(ctx, tenant.ID, filter)
}

func (management *TenantManagement) CreateRole(
	ctx context.Context,
	session domain.Session,
	name string,
	permissions []domain.Permission,
) (domain.Role, error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return domain.Role{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, domain.PermissionRoleManage); err != nil {
		return domain.Role{}, err
	}
	name, err = domain.NormalizeRoleName(name)
	if err != nil || !domain.ValidPermissions(permissions) {
		return domain.Role{}, domain.NewError(domain.ErrorValidation)
	}
	return management.roles.CreateRole(ctx, domain.Role{
		TenantID: tenant.ID, Name: name, Kind: domain.RoleKindCustom,
		Permissions: slices.Clone(permissions),
	}, session.User.ID)
}

func (management *TenantManagement) UpdateRole(
	ctx context.Context,
	session domain.Session,
	role domain.Role,
) (domain.Role, error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return domain.Role{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, domain.PermissionRoleManage); err != nil {
		return domain.Role{}, err
	}
	role.Name, err = domain.NormalizeRoleName(role.Name)
	if err != nil || !role.ID.IsValid() || role.Revision == 0 || !domain.ValidPermissions(role.Permissions) {
		return domain.Role{}, domain.NewError(domain.ErrorValidation)
	}
	role.TenantID = tenant.ID
	current, err := management.roles.FindRole(ctx, tenant.ID, role.ID)
	if err != nil {
		return domain.Role{}, err
	}
	if current.IsProtected() {
		return domain.Role{}, domain.NewError(domain.ErrorConflict)
	}
	return management.roles.UpdateRole(ctx, role, session.User.ID)
}

func (management *TenantManagement) DeleteRole(
	ctx context.Context,
	session domain.Session,
	roleID domain.RoleID,
	revision uint64,
) error {
	tenant, err := activeTenant(session)
	if err != nil {
		return err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, domain.PermissionRoleManage); err != nil {
		return err
	}
	if !roleID.IsValid() || revision == 0 {
		return domain.NewError(domain.ErrorValidation)
	}
	role, err := management.roles.FindRole(ctx, tenant.ID, roleID)
	if err != nil {
		return err
	}
	if role.IsProtected() {
		return domain.NewError(domain.ErrorConflict)
	}
	return management.roles.DeleteRole(ctx, tenant.ID, roleID, revision, session.User.ID)
}

func (management *TenantManagement) ListInvitations(
	ctx context.Context,
	session domain.Session,
	filter domain.InvitationFilter,
) (domain.Page[domain.Invitation], error) {
	tenant, err := activeTenant(session)
	if err != nil {
		return domain.Page[domain.Invitation]{}, err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, domain.PermissionUserRead); err != nil {
		return domain.Page[domain.Invitation]{}, err
	}
	filter, err = filter.Normalized()
	if err != nil {
		return domain.Page[domain.Invitation]{}, err
	}
	return management.invitations.ListTenantInvitations(ctx, tenant.ID, filter)
}

func (management *TenantManagement) RevokeInvitation(
	ctx context.Context,
	session domain.Session,
	id domain.InvitationID,
) error {
	tenant, err := activeTenant(session)
	if err != nil {
		return err
	}
	if err := management.require(ctx, session.User.ID, tenant.ID, domain.PermissionUserManage); err != nil {
		return err
	}
	if !id.IsValid() {
		return domain.NewError(domain.ErrorValidation)
	}
	return management.invitations.RevokeTenantInvitation(ctx, tenant.ID, id, session.User.ID)
}

func (management *TenantManagement) require(
	ctx context.Context,
	userID domain.UserID,
	tenantID domain.TenantID,
	permission domain.Permission,
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
		return domain.NewError(domain.ErrorUnauthorized)
	}
	return nil
}

func activeTenant(session domain.Session) (domain.Tenant, error) {
	if session.ActiveTenant == nil || !session.ActiveTenant.ID.IsValid() || !session.User.ID.IsValid() {
		return domain.Tenant{}, domain.NewError(domain.ErrorUnauthorized)
	}
	return *session.ActiveTenant, nil
}
