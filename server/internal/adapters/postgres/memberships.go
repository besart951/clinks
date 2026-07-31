package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type MembershipRepository struct {
	pool *pgxpool.Pool
}

func NewMembershipRepository(pool *pgxpool.Pool) *MembershipRepository {
	return &MembershipRepository{pool: pool}
}

func (repository *MembershipRepository) MembershipsForUser(ctx context.Context, userID domain.UserID) ([]domain.Membership, error) {
	memberships := make([]domain.Membership, 0)
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, membershipQuery+" WHERE membership.user_id = $1 AND membership.status = $2 ORDER BY tenant.name", userID, domain.MembershipActive)
		if err != nil {
			return fmt.Errorf("list memberships: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			membership, scanErr := scanMembership(rows)
			if scanErr != nil {
				return scanErr
			}
			memberships = append(memberships, membership)
		}
		return rows.Err()
	})
	return memberships, err
}

func (repository *MembershipRepository) FindActiveMembership(ctx context.Context, userID domain.UserID, tenantID domain.TenantID) (domain.Membership, error) {
	var membership domain.Membership
	err := WithTenantTx(ctx, repository.pool, tenantID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, membershipQuery+" WHERE membership.user_id = $1 AND membership.tenant_id = $2 AND membership.status = $3", userID, tenantID, domain.MembershipActive)
		var scanErr error
		membership, scanErr = scanMembership(row)
		return scanErr
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Membership{}, domain.NewError(domain.ErrorMembershipNotFound)
	}
	return membership, err
}

func (repository *MembershipRepository) CreateInvitation(ctx context.Context, invitation *domain.Invitation) (domain.Invitation, error) {
	if invitation.ID == "" {
		id, err := newUUID()
		if err != nil {
			return domain.Invitation{}, err
		}
		invitation.ID = domain.InvitationID(id)
	}
	err := WithTenantTx(ctx, repository.pool, invitation.TenantID, func(tx pgx.Tx) error {
		_, execErr := tx.Exec(ctx, `INSERT INTO invitations
			(id, tenant_id, email, role, token_hash, expires_at, created_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`, invitation.ID, invitation.TenantID, invitation.Email, invitation.Role, invitation.TokenHash, invitation.ExpiresAt, invitation.CreatedBy)
		if execErr != nil {
			return fmt.Errorf("create invitation: %w", execErr)
		}
		event := domain.AuditEvent{ActorID: &invitation.CreatedBy, TenantID: &invitation.TenantID, Action: "invitation.created", Target: string(invitation.Email)}
		if auditErr := insertAuditEvent(ctx, tx, &event); auditErr != nil {
			return auditErr
		}
		jobID, idErr := newUUID()
		if idErr != nil {
			return idErr
		}
		_, execErr = tx.Exec(ctx, `INSERT INTO outbox_jobs (id, tenant_id, kind, invitation_id)
			VALUES ($1, $2, 'invitation.email', $3)`, jobID, invitation.TenantID, invitation.ID)
		if execErr != nil {
			return fmt.Errorf("enqueue invitation email: %w", execErr)
		}
		return nil
	})
	return *invitation, err
}

func (repository *MembershipRepository) FindInvitation(ctx context.Context, hash domain.InvitationHash) (domain.Invitation, error) {
	var invitation domain.Invitation
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `SELECT id, tenant_id, email, role, token_hash, expires_at, used_at, created_by
			FROM invitations WHERE token_hash = $1`, hash).Scan(&invitation.ID, &invitation.TenantID, &invitation.Email, &invitation.Role, &invitation.TokenHash, &invitation.ExpiresAt, &invitation.UsedAt, &invitation.CreatedBy)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NewError(domain.ErrorInvitationInvalid)
		}
		return err
	})
	if err != nil {
		return domain.Invitation{}, err
	}
	if invitation.UsedAt != nil {
		return domain.Invitation{}, domain.NewError(domain.ErrorInvitationUsed)
	}
	if !invitation.ExpiresAt.After(time.Now()) {
		return domain.Invitation{}, domain.NewError(domain.ErrorInvitationExpired)
	}
	return invitation, nil
}

func (repository *MembershipRepository) AcceptInvitation(ctx context.Context, acceptance *domain.InvitationAcceptance) (domain.User, domain.Membership, error) {
	return repository.acceptInvitation(ctx, acceptance, nil)
}

func (repository *MembershipRepository) AcceptExternalInvitation(ctx context.Context, acceptance *domain.InvitationAcceptance, identity domain.ExternalIdentity) (domain.User, domain.Membership, error) {
	return repository.acceptInvitation(ctx, acceptance, &identity)
}

func (repository *MembershipRepository) acceptInvitation(ctx context.Context, acceptance *domain.InvitationAcceptance, identity *domain.ExternalIdentity) (domain.User, domain.Membership, error) {
	var user domain.User
	var membership domain.Membership
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		invitation, err := lockedInvitation(ctx, tx, acceptance.Invitation.TokenHash)
		if err != nil {
			return err
		}
		if invitation.Email != acceptance.User.Email {
			return domain.NewError(domain.ErrorInviteEmailMismatch)
		}
		user, err = acceptIdentity(ctx, tx, acceptance)
		if err != nil {
			return err
		}
		if identity != nil {
			if identity.Email != user.Email {
				return domain.NewError(domain.ErrorInviteEmailMismatch)
			}
			if _, err = tx.Exec(ctx, `INSERT INTO external_identities (issuer, subject, user_id, email)
				VALUES ($1, $2, $3, $4)`, identity.Issuer, identity.Subject, user.ID, identity.Email); err != nil {
				return fmt.Errorf("link invitation external identity: %w", err)
			}
		}
		membership, err = createMembership(ctx, tx, &invitation, user.ID)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "UPDATE invitations SET used_at = now() WHERE id = $1", invitation.ID); err != nil {
			return fmt.Errorf("mark invitation as used: %w", err)
		}
		event := domain.AuditEvent{ActorID: &user.ID, TenantID: &invitation.TenantID, Action: "invitation.accepted", Target: string(user.Email)}
		return insertAuditEvent(ctx, tx, &event)
	})
	return user, membership, err
}

const membershipQuery = `SELECT membership.id, membership.user_id, tenant.id, tenant.name, membership.role, membership.status
	FROM tenant_memberships membership JOIN tenants tenant ON tenant.id = membership.tenant_id`

type membershipScanner interface {
	Scan(...any) error
}

func scanMembership(scanner membershipScanner) (domain.Membership, error) {
	var membership domain.Membership
	err := scanner.Scan(&membership.ID, &membership.UserID, &membership.Tenant.ID, &membership.Tenant.Name, &membership.Role, &membership.Status)
	if err != nil {
		return domain.Membership{}, err
	}
	return membership, nil
}

func lockedInvitation(ctx context.Context, tx pgx.Tx, hash domain.InvitationHash) (domain.Invitation, error) {
	var invitation domain.Invitation
	err := tx.QueryRow(ctx, `SELECT id, tenant_id, email, role, token_hash, expires_at, used_at, created_by
		FROM invitations WHERE token_hash = $1 FOR UPDATE`, hash).Scan(&invitation.ID, &invitation.TenantID, &invitation.Email, &invitation.Role, &invitation.TokenHash, &invitation.ExpiresAt, &invitation.UsedAt, &invitation.CreatedBy)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Invitation{}, domain.NewError(domain.ErrorInvitationInvalid)
	}
	if err != nil {
		return domain.Invitation{}, fmt.Errorf("lock invitation: %w", err)
	}
	if invitation.UsedAt != nil {
		return domain.Invitation{}, domain.NewError(domain.ErrorInvitationUsed)
	}
	if !invitation.ExpiresAt.After(time.Now()) {
		return domain.Invitation{}, domain.NewError(domain.ErrorInvitationExpired)
	}
	return invitation, nil
}

func acceptIdentity(ctx context.Context, tx pgx.Tx, acceptance *domain.InvitationAcceptance) (domain.User, error) {
	if acceptance.User.ID != "" {
		return acceptance.User, nil
	}
	id, err := newUUID()
	if err != nil {
		return domain.User{}, err
	}
	user := acceptance.User
	user.ID = domain.UserID(id)
	user.Role = domain.RoleUser
	var password any
	if acceptance.Password != nil {
		password = *acceptance.Password
	}
	if _, err = tx.Exec(ctx, `INSERT INTO users (id, tenant_id, email, password_hash, role, global_role, locale)
		VALUES ($1, NULL, $2, $3, $4, $5, $6)`, user.ID, user.Email, password, domain.RoleUser, domain.RoleUser, user.Locale); err != nil {
		return domain.User{}, mapIdentityDatabaseError(err)
	}
	return user, nil
}

func createMembership(ctx context.Context, tx pgx.Tx, invitation *domain.Invitation, userID domain.UserID) (domain.Membership, error) {
	id, err := newUUID()
	if err != nil {
		return domain.Membership{}, err
	}
	var tenant domain.Tenant
	if err = tx.QueryRow(ctx, "SELECT id, name FROM tenants WHERE id = $1", invitation.TenantID).Scan(&tenant.ID, &tenant.Name); err != nil {
		return domain.Membership{}, fmt.Errorf("find invitation tenant: %w", err)
	}
	membership := domain.Membership{ID: domain.MembershipID(id), UserID: userID, Tenant: tenant, Role: invitation.Role, Status: domain.MembershipActive}
	if _, err = tx.Exec(ctx, `INSERT INTO tenant_memberships (id, tenant_id, user_id, role, status)
		VALUES ($1, $2, $3, $4, $5)`, membership.ID, tenant.ID, userID, membership.Role, membership.Status); err != nil {
		return domain.Membership{}, fmt.Errorf("create invitation membership: %w", err)
	}
	return membership, nil
}
