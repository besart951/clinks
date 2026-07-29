package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type TenantProvisioner struct {
	pool *pgxpool.Pool
}

func NewTenantProvisioner(pool *pgxpool.Pool) *TenantProvisioner {
	return &TenantProvisioner{pool: pool}
}

func (provisioner *TenantProvisioner) CreateTenantOwner(ctx context.Context, registration domain.TenantOwnerRegistration) (domain.Session, error) {
	tenantID, err := newUUID()
	if err != nil {
		return domain.Session{}, err
	}
	userID, err := newUUID()
	if err != nil {
		return domain.Session{}, err
	}
	membershipID, err := newUUID()
	if err != nil {
		return domain.Session{}, err
	}
	tenant := domain.Tenant{ID: domain.TenantID(tenantID), Name: strings.TrimSpace(registration.TenantName)}
	user := domain.User{ID: domain.UserID(userID), Email: registration.Email, Role: domain.RoleUser, Locale: registration.Locale, SessionVersion: 1}
	membership := domain.Membership{ID: domain.MembershipID(membershipID), UserID: user.ID, Tenant: tenant, Role: domain.RoleTenantAdmin, Status: domain.MembershipActive}
	err = withSystemTx(ctx, provisioner.pool, func(tx pgx.Tx) error {
		if _, err = tx.Exec(ctx, "INSERT INTO tenants (id, name) VALUES ($1, $2)", tenant.ID, tenant.Name); err != nil {
			return fmt.Errorf("create tenant: %w", err)
		}
		if _, err = tx.Exec(ctx, `INSERT INTO users (id, tenant_id, email, password_hash, role, global_role, locale)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`, user.ID, tenant.ID, user.Email, registration.PasswordHash, domain.RoleTenantAdmin, domain.RoleUser, user.Locale); err != nil {
			return mapIdentityDatabaseError(err)
		}
		if _, err = tx.Exec(ctx, `INSERT INTO tenant_memberships (id, tenant_id, user_id, role, status)
			VALUES ($1, $2, $3, $4, $5)`, membership.ID, tenant.ID, user.ID, membership.Role, membership.Status); err != nil {
			return fmt.Errorf("create owner membership: %w", err)
		}
		event := domain.AuditEvent{ActorID: &user.ID, TenantID: &tenant.ID, Action: "tenant.registered", Target: tenant.Name}
		return insertAuditEvent(ctx, tx, &event)
	})
	if err != nil {
		return domain.Session{}, fmt.Errorf("provision tenant owner: %w", err)
	}
	return domain.Session{User: user, ActiveTenant: &tenant, Memberships: []domain.Membership{membership}}, nil
}
