package postgres

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/ports"
)

// Store is the PostgreSQL adapter at the persistence seam. Consumer-owned
// ports expose only the capabilities each domain module needs.
type Store struct {
	pool *pgxpool.Pool
}

var (
	_ ports.BootstrapRepository            = (*Store)(nil)
	_ ports.SessionIdentityRepository      = (*Store)(nil)
	_ ports.ExternalIdentityRepository     = (*Store)(nil)
	_ ports.TenantProvisioner              = (*Store)(nil)
	_ ports.TenantAdministrationRepository = (*Store)(nil)
	_ ports.TenantEditor                   = (*Store)(nil)
	_ ports.MembershipSessionReader        = (*Store)(nil)
	_ ports.MembershipManager              = (*Store)(nil)
	_ ports.RoleRepository                 = (*Store)(nil)
	_ ports.InvitationRepository           = (*Store)(nil)
	_ ports.AuditAppender                  = (*Store)(nil)
	_ ports.AuditReader                    = (*Store)(nil)
	_ ports.LocalizationOverrides          = (*Store)(nil)
	_ ports.LocalizationEditor             = (*Store)(nil)
	_ ports.UserDirectory                  = (*Store)(nil)
	_ ports.InvitationAdministration       = (*Store)(nil)
	_ ports.SystemStatsRepository          = (*Store)(nil)
	_ ports.ReadinessChecker               = (*Store)(nil)
	_ ports.OutboxRepository               = (*Store)(nil)
)

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}
