package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type InvitationRepository struct {
	pool *pgxpool.Pool
}

func NewInvitationRepository(
	pool *pgxpool.Pool,
) *InvitationRepository {
	return &InvitationRepository{
		pool: pool,
	}
}

func (repository *InvitationRepository) CreateInvitation(
	ctx context.Context,
	invitation domain.Invitation,
) (domain.Invitation, error) {
	if invitation.ID == "" ||
		invitation.TenantID == "" ||
		invitation.RoleID == "" {
		return domain.Invitation{},
			domain.NewError(domain.ErrorValidation)
	}

	err := WithTenantTx(
		ctx,
		repository.pool,
		invitation.TenantID,
		func(tx pgx.Tx) error {
			_, err := tx.Exec(
				ctx,
				`
					INSERT INTO invitations (
						id,
						tenant_id,
						email,
						role_id,
						token_hash,
						expires_at,
						created_by,
						delivery_status
					)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				`,
				invitation.ID,
				invitation.TenantID,
				invitation.Email,
				invitation.RoleID,
				invitation.TokenHash,
				invitation.ExpiresAt,
				invitation.CreatedBy,
				domain.InvitationDeliveryQueued,
			)
			if err != nil {
				return fmt.Errorf(
					"create invitation: %w",
					err,
				)
			}

			if err := insertAuditEvent(
				ctx,
				tx,
				domain.AuditEvent{
					ActorID:  new(invitation.CreatedBy),
					TenantID: new(invitation.TenantID),
					Action:   "invitation.created",
					Target:   string(invitation.Email),
				},
			); err != nil {
				return err
			}

			jobID, err := newUUID()
			if err != nil {
				return err
			}

			_, err = tx.Exec(
				ctx,
				`
					INSERT INTO outbox_jobs (
						id,
						tenant_id,
						kind,
						invitation_id,
						status
					)
					VALUES ($1, $2, $3, $4, $5)
				`,
				jobID,
				invitation.TenantID,
				outboxJobInvitationEmail,
				invitation.ID,
				outboxStatusPending,
			)
			if err != nil {
				return fmt.Errorf(
					"enqueue invitation email: %w",
					err,
				)
			}

			return nil
		},
	)

	if err != nil {
		return domain.Invitation{}, err
	}

	invitation.DeliveryStatus =
		domain.InvitationDeliveryQueued

	return invitation, nil
}

func (repository *InvitationRepository) FindInvitation(
	ctx context.Context,
	hash domain.InvitationHash,
) (domain.Invitation, error) {
	var invitation domain.Invitation

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			err := tx.QueryRow(
				ctx,
				invitationSelect+`
					WHERE invitation.token_hash = $1
				`,
				hash,
			).Scan(
				invitationScanTargets(&invitation)...,
			)

			if err == pgx.ErrNoRows {
				return domain.NewError(
					domain.ErrorInvitationInvalid,
				)
			}

			if err != nil {
				return fmt.Errorf(
					"find invitation: %w",
					err,
				)
			}

			return nil
		},
	)

	return invitation, err
}

func (repository *InvitationRepository) AcceptInvitation(
	ctx context.Context,
	acceptance domain.InvitationAcceptance,
) (domain.User, domain.Membership, error) {
	return repository.acceptInvitation(
		ctx,
		acceptance,
		nil,
	)
}

func (repository *InvitationRepository) AcceptExternalInvitation(
	ctx context.Context,
	acceptance domain.InvitationAcceptance,
	identity domain.ExternalIdentity,
) (domain.User, domain.Membership, error) {
	return repository.acceptInvitation(
		ctx,
		acceptance,
		&identity,
	)
}

func (repository *InvitationRepository) acceptInvitation(
	ctx context.Context,
	acceptance domain.InvitationAcceptance,
	identity *domain.ExternalIdentity,
) (domain.User, domain.Membership, error) {
	var user domain.User
	var membership domain.Membership

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			invitation, err := lockedInvitation(
				ctx,
				tx,
				acceptance.Invitation.TokenHash,
			)
			if err != nil {
				return err
			}

			if invitation.Email != acceptance.User.Email {
				return domain.NewError(
					domain.ErrorInviteEmailMismatch,
				)
			}

			user, err = acceptIdentity(
				ctx,
				tx,
				acceptance,
			)
			if err != nil {
				return err
			}

			if identity != nil {
				if identity.Email != user.Email {
					return domain.NewError(
						domain.ErrorInviteEmailMismatch,
					)
				}

				if _, err := tx.Exec(
					ctx,
					`
						INSERT INTO external_identities (
							issuer,
							subject,
							user_id,
							email
						)
						VALUES ($1, $2, $3, $4)
					`,
					identity.Issuer,
					identity.Subject,
					user.ID,
					identity.Email,
				); err != nil {
					return fmt.Errorf(
						"link invitation external identity: %w",
						err,
					)
				}
			}

			membership, err = createMembership(
				ctx,
				tx,
				invitation,
				user.ID,
			)
			if err != nil {
				return err
			}

			result, err := tx.Exec(
				ctx,
				`
					UPDATE invitations
					SET used_at = now()
					WHERE
						id = $1
						AND used_at IS NULL
				`,
				invitation.ID,
			)
			if err != nil {
				return fmt.Errorf(
					"mark invitation as used: %w",
					err,
				)
			}

			if result.RowsAffected() != 1 {
				return domain.NewError(
					domain.ErrorInvitationUsed,
				)
			}

			return insertAuditEvent(
				ctx,
				tx,
				domain.AuditEvent{
					ActorID:  new(user.ID),
					TenantID: new(invitation.TenantID),
					Action:   "invitation.accepted",
					Target:   string(user.Email),
				},
			)
		},
	)

	return user, membership, err
}

const invitationSelect = `
	SELECT
		invitation.id,
		invitation.tenant_id,
		invitation.email,
		invitation.role_id,
		invitation.token_hash,
		invitation.expires_at,
		invitation.used_at,
		invitation.created_by,
		invitation.delivery_status
	FROM invitations invitation
`

func invitationScanTargets(
	invitation *domain.Invitation,
) []any {
	return []any{
		&invitation.ID,
		&invitation.TenantID,
		&invitation.Email,
		&invitation.RoleID,
		&invitation.TokenHash,
		&invitation.ExpiresAt,
		&invitation.UsedAt,
		&invitation.CreatedBy,
		&invitation.DeliveryStatus,
	}
}

func lockedInvitation(
	ctx context.Context,
	tx pgx.Tx,
	hash domain.InvitationHash,
) (domain.Invitation, error) {
	var invitation domain.Invitation
	var expired bool

	err := tx.QueryRow(
		ctx,
		`
			SELECT
				id,
				tenant_id,
				email,
				role_id,
				token_hash,
				expires_at,
				used_at,
				created_by,
				delivery_status,
				expires_at <= now()
			FROM invitations
			WHERE token_hash = $1
			FOR UPDATE
		`,
		hash,
	).Scan(
		&invitation.ID,
		&invitation.TenantID,
		&invitation.Email,
		&invitation.RoleID,
		&invitation.TokenHash,
		&invitation.ExpiresAt,
		&invitation.UsedAt,
		&invitation.CreatedBy,
		&invitation.DeliveryStatus,
		&expired,
	)

	if err == pgx.ErrNoRows {
		return domain.Invitation{},
			domain.NewError(
				domain.ErrorInvitationInvalid,
			)
	}

	if err != nil {
		return domain.Invitation{},
			fmt.Errorf("lock invitation: %w", err)
	}

	if invitation.UsedAt != nil {
		return domain.Invitation{},
			domain.NewError(
				domain.ErrorInvitationUsed,
			)
	}

	if expired {
		return domain.Invitation{},
			domain.NewError(
				domain.ErrorInvitationExpired,
			)
	}

	return invitation, nil
}

func acceptIdentity(
	ctx context.Context,
	tx pgx.Tx,
	acceptance domain.InvitationAcceptance,
) (domain.User, error) {
	if acceptance.User.ID != "" {
		return acceptance.User, nil
	}

	user := acceptance.User

	id, err := newUUID()
	if err != nil {
		return domain.User{}, err
	}

	user.ID = domain.UserID(id)
	user.IsSuperAdmin = false

	var passwordHash any
	if acceptance.Password != nil {
		passwordHash = *acceptance.Password
	}

	_, err = tx.Exec(
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
			VALUES ($1, $2, $3, FALSE, $4, $5)
		`,
		user.ID,
		user.Email,
		passwordHash,
		user.Locale,
		user.SessionVersion,
	)
	if err != nil {
		return domain.User{},
			mapIdentityDatabaseError(err)
	}

	return user, nil
}

func createMembership(
	ctx context.Context,
	tx pgx.Tx,
	invitation domain.Invitation,
	userID domain.UserID,
) (domain.Membership, error) {
	id, err := newUUID()
	if err != nil {
		return domain.Membership{}, err
	}

	var membership domain.Membership

	membership.ID = domain.MembershipID(id)
	membership.UserID = userID
	membership.RoleID = invitation.RoleID
	membership.Status = domain.MembershipActive

	err = tx.QueryRow(
		ctx,
		`
			SELECT
				tenant.id,
				tenant.name,
				role.name
			FROM tenants tenant
			JOIN tenant_roles role
				ON role.tenant_id = tenant.id
			WHERE
				tenant.id = $1
				AND role.id = $2
		`,
		invitation.TenantID,
		invitation.RoleID,
	).Scan(
		&membership.Tenant.ID,
		&membership.Tenant.Name,
		&membership.RoleName,
	)
	if err == pgx.ErrNoRows {
		return domain.Membership{},
			domain.NewError(domain.ErrorRoleNotFound)
	}

	if err != nil {
		return domain.Membership{},
			fmt.Errorf(
				"find invitation tenant role: %w",
				err,
			)
	}

	_, err = tx.Exec(
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
		membership.Tenant.ID,
		userID,
		membership.RoleID,
		membership.Status,
	)
	if err != nil {
		return domain.Membership{},
			fmt.Errorf(
				"create invitation membership: %w",
				err,
			)
	}

	return membership, nil
}
