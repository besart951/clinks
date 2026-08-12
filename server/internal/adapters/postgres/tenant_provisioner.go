package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func (repository *Store) CreateTenantOwner(
	ctx context.Context,
	registration domain.TenantOwnerRegistration,
) (domain.Session, error) {
	owner, err := newTenantOwner(registration)
	if err != nil {
		return domain.Session{}, err
	}

	err = withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			return provisionTenantOwner(ctx, tx, registration.PasswordHash, &owner)
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
		User:         owner.user,
		ActiveTenant: new(owner.tenant),
		Memberships: []domain.Membership{
			owner.membership,
		},
	}, nil
}

type tenantOwner struct {
	tenant     domain.Tenant
	user       domain.User
	membership domain.Membership
}

func newTenantOwner(registration domain.TenantOwnerRegistration) (tenantOwner, error) {
	tenantID, err := newUUID()
	if err != nil {
		return tenantOwner{}, err
	}
	userID, err := newUUID()
	if err != nil {
		return tenantOwner{}, err
	}
	membershipID, err := newUUID()
	if err != nil {
		return tenantOwner{}, err
	}

	tenant := domain.Tenant{ID: domain.TenantID(tenantID), Name: strings.TrimSpace(registration.TenantName), Revision: 1}
	user := domain.User{
		ID: domain.UserID(userID), Email: registration.Email, GlobalRole: domain.GlobalRoleUser,
		Locale: registration.Locale, SessionVersion: 1,
	}
	return tenantOwner{
		tenant: tenant,
		user:   user,
		membership: domain.Membership{
			ID: domain.MembershipID(membershipID), UserID: user.ID, Tenant: tenant,
			Revision: 1, Status: domain.MembershipActive,
		},
	}, nil
}

func provisionTenantOwner(ctx context.Context, tx pgx.Tx, passwordHash domain.PasswordHash, owner *tenantOwner) error {
	if err := insertTenant(ctx, tx, owner.tenant); err != nil {
		return err
	}
	if err := insertTenantOwnerUser(ctx, tx, owner.user, passwordHash); err != nil {
		return err
	}
	roles, err := createDefaultRoles(ctx, tx, owner.tenant.ID)
	if err != nil {
		return err
	}
	owner.membership.RoleID = roles.Administrator.ID
	owner.membership.Role = roles.Administrator
	if err := insertOwnerMembership(ctx, tx, owner.membership); err != nil {
		return err
	}
	return insertAuditEvent(ctx, tx, domain.AuditEvent{
		ActorID: new(owner.user.ID), TenantID: new(owner.tenant.ID),
		Action: "tenant.registered", Target: owner.tenant.Name,
	})
}

func insertTenant(ctx context.Context, tx pgx.Tx, tenant domain.Tenant) error {
	if _, err := tx.Exec(ctx, `INSERT INTO tenants (id, name) VALUES ($1, $2)`, tenant.ID, tenant.Name); err != nil {
		return fmt.Errorf("create tenant: %w", err)
	}
	return nil
}

func insertTenantOwnerUser(ctx context.Context, tx pgx.Tx, user domain.User, passwordHash domain.PasswordHash) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, global_role, locale, session_version)
		VALUES ($1, $2, $3, $4, $5, 1)
	`, user.ID, user.Email, passwordHash, user.GlobalRole, user.Locale)
	if err != nil {
		return mapIdentityDatabaseError(err)
	}
	return nil
}

func insertOwnerMembership(ctx context.Context, tx pgx.Tx, membership domain.Membership) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO tenant_memberships (id, tenant_id, user_id, role_id, status)
		VALUES ($1, $2, $3, $4, $5)
	`, membership.ID, membership.Tenant.ID, membership.UserID, membership.RoleID, membership.Status)
	if err != nil {
		return fmt.Errorf("create owner membership: %w", err)
	}
	return nil
}
