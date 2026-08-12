package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	clinks "github.com/besartmorina/clinks/server"
)

func (store *Store) CreateTenantOwner(
	ctx context.Context,
	registration clinks.TenantOwnerRegistration,
) (clinks.Session, error) {
	owner, err := newTenantOwner(registration)
	if err != nil {
		return clinks.Session{}, err
	}

	err = withSystemTx(
		ctx,
		store.pool,
		func(tx pgx.Tx) error {
			return provisionTenantOwner(ctx, tx, registration.PasswordHash, &owner)
		},
	)
	if err != nil {
		return clinks.Session{},
			fmt.Errorf(
				"provision tenant owner: %w",
				err,
			)
	}

	return clinks.Session{
		User:         owner.user,
		ActiveTenant: new(owner.tenant),
		Memberships: []clinks.Membership{
			owner.membership,
		},
	}, nil
}

type tenantOwner struct {
	tenant     clinks.Tenant
	user       clinks.User
	membership clinks.Membership
}

func newTenantOwner(registration clinks.TenantOwnerRegistration) (tenantOwner, error) {
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

	tenant := clinks.Tenant{ID: clinks.TenantID(tenantID), Name: strings.TrimSpace(registration.TenantName), Revision: 1}
	user := clinks.User{
		ID: clinks.UserID(userID), Email: registration.Email, GlobalRole: clinks.GlobalRoleUser,
		Locale: registration.Locale, SessionVersion: 1,
	}
	return tenantOwner{
		tenant: tenant,
		user:   user,
		membership: clinks.Membership{
			ID: clinks.MembershipID(membershipID), UserID: user.ID, Tenant: tenant,
			Revision: 1, Status: clinks.MembershipActive,
		},
	}, nil
}

func provisionTenantOwner(ctx context.Context, tx pgx.Tx, passwordHash clinks.PasswordHash, owner *tenantOwner) error {
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
	return insertAuditEvent(ctx, tx, clinks.AuditEvent{
		ActorID: new(owner.user.ID), TenantID: new(owner.tenant.ID),
		Action: "tenant.registered", Target: owner.tenant.Name,
	})
}

func insertTenant(ctx context.Context, tx pgx.Tx, tenant clinks.Tenant) error {
	if _, err := tx.Exec(ctx, `INSERT INTO tenants (id, name) VALUES ($1, $2)`, tenant.ID, tenant.Name); err != nil {
		return fmt.Errorf("create tenant: %w", err)
	}
	return nil
}

func insertTenantOwnerUser(ctx context.Context, tx pgx.Tx, user clinks.User, passwordHash clinks.PasswordHash) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, global_role, locale, session_version)
		VALUES ($1, $2, $3, $4, $5, 1)
	`, user.ID, user.Email, passwordHash, user.GlobalRole, user.Locale)
	if err != nil {
		return mapIdentityDatabaseError(err)
	}
	return nil
}

func insertOwnerMembership(ctx context.Context, tx pgx.Tx, membership clinks.Membership) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO tenant_memberships (id, tenant_id, user_id, role_id, status)
		VALUES ($1, $2, $3, $4, $5)
	`, membership.ID, membership.Tenant.ID, membership.UserID, membership.RoleID, membership.Status)
	if err != nil {
		return fmt.Errorf("create owner membership: %w", err)
	}
	return nil
}
