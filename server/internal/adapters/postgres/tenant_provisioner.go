package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

const defaultTenantAdministratorRoleName = "Administrator"

type TenantProvisioner struct {
	pool *pgxpool.Pool
}

func NewTenantProvisioner(
	pool *pgxpool.Pool,
) *TenantProvisioner {
	return &TenantProvisioner{
		pool: pool,
	}
}

func (provisioner *TenantProvisioner) CreateTenantOwner(
	ctx context.Context,
	registration domain.TenantOwnerRegistration,
) (domain.Session, error) {
	tenantID, err := newUUID()
	if err != nil {
		return domain.Session{}, err
	}

	userID, err := newUUID()
	if err != nil {
		return domain.Session{}, err
	}

	roleID, err := newUUID()
	if err != nil {
		return domain.Session{}, err
	}

	membershipID, err := newUUID()
	if err != nil {
		return domain.Session{}, err
	}

	tenant := domain.Tenant{
		ID: domain.TenantID(tenantID),
		Name: strings.TrimSpace(
			registration.TenantName,
		),
	}

	user := domain.User{
		ID:             domain.UserID(userID),
		Email:          registration.Email,
		IsSuperAdmin:   false,
		Locale:         registration.Locale,
		SessionVersion: 1,
	}

	role := domain.Role{
		ID:       domain.RoleID(roleID),
		TenantID: tenant.ID,
		Name:     defaultTenantAdministratorRoleName,
	}

	membership := domain.Membership{
		ID:       domain.MembershipID(membershipID),
		UserID:   user.ID,
		Tenant:   tenant,
		RoleID:   role.ID,
		RoleName: role.Name,
		Status:   domain.MembershipActive,
	}

	err = withSystemTx(
		ctx,
		provisioner.pool,
		func(tx pgx.Tx) error {
			if _, err := tx.Exec(
				ctx,
				`
					INSERT INTO tenants (
						id,
						name
					)
					VALUES ($1, $2)
				`,
				tenant.ID,
				tenant.Name,
			); err != nil {
				return fmt.Errorf(
					"create tenant: %w",
					err,
				)
			}

			if _, err := tx.Exec(
				ctx,
				`
					INSERT INTO users (
						id,
						email,
						password_hash,
						is_super_admin,
						locale,
						session_version
					)
					VALUES (
						$1,
						$2,
						$3,
						FALSE,
						$4,
						1
					)
				`,
				user.ID,
				user.Email,
				registration.PasswordHash,
				user.Locale,
			); err != nil {
				return mapIdentityDatabaseError(err)
			}

			if _, err := tx.Exec(
				ctx,
				`
					INSERT INTO tenant_roles (
						id,
						tenant_id,
						name
					)
					VALUES ($1, $2, $3)
				`,
				role.ID,
				role.TenantID,
				role.Name,
			); err != nil {
				return fmt.Errorf(
					"create administrator role: %w",
					err,
				)
			}

			if err := insertRolePermissions(
				ctx,
				tx,
				tenant.ID,
				role.ID,
				domain.AllPermissions(),
			); err != nil {
				return err
			}

			if _, err := tx.Exec(
				ctx,
				`
					INSERT INTO tenant_memberships (
						id,
						tenant_id,
						user_id,
						role_id,
						status
					)
					VALUES ($1, $2, $3, $4, $5)
				`,
				membership.ID,
				tenant.ID,
				user.ID,
				membership.RoleID,
				membership.Status,
			); err != nil {
				return fmt.Errorf(
					"create owner membership: %w",
					err,
				)
			}

			return insertAuditEvent(
				ctx,
				tx,
				domain.AuditEvent{
					ActorID:  new(user.ID),
					TenantID: new(tenant.ID),
					Action:   "tenant.registered",
					Target:   tenant.Name,
				},
			)
		},
	)
	if err != nil {
		return domain.Session{},
			fmt.Errorf(
				"provision tenant owner: %w",
				err,
			)
	}

	return domain.Session{
		User:         user,
		ActiveTenant: new(tenant),
		Memberships: []domain.Membership{
			membership,
		},
	}, nil
}
