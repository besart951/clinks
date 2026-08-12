package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

func (repository *Store) CreateInvitation(
	ctx context.Context,
	invitation domain.Invitation,
) (domain.Invitation, error) {
	if !invitation.ID.IsValid() ||
		!invitation.TenantID.IsValid() ||
		!invitation.RoleID.IsValid() ||
		!invitation.CreatedBy.IsValid() ||
		!invitation.Locale.IsValid() {
		return domain.Invitation{},
			domain.NewError(domain.ErrorValidation)
	}

	err := WithTenantTx(
		ctx,
		repository.pool,
		invitation.TenantID,
		func(tx pgx.Tx) error {
			return createInvitationTx(ctx, tx, invitation)
		},
	)
	if err != nil {
		return domain.Invitation{}, err
	}

	invitation.DeliveryStatus = domain.InvitationDeliveryQueued

	return invitation, nil
}

func createInvitationTx(ctx context.Context, tx pgx.Tx, invitation domain.Invitation) error {
	if err := insertInvitation(ctx, tx, invitation); err != nil {
		return err
	}
	if err := insertAuditEvent(ctx, tx, domain.AuditEvent{
		ActorID: new(invitation.CreatedBy), TenantID: new(invitation.TenantID),
		Action: "invitation.created", Target: string(invitation.Email),
	}); err != nil {
		return err
	}
	return enqueueInvitationEmail(ctx, tx, invitation)
}

func insertInvitation(ctx context.Context, tx pgx.Tx, invitation domain.Invitation) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO invitations (
			id, tenant_id, email, role_id, token_hash, expires_at, created_by, delivery_status, delivery_locale
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, invitation.ID, invitation.TenantID, invitation.Email, invitation.RoleID,
		invitation.TokenHash, invitation.ExpiresAt, invitation.CreatedBy, domain.InvitationDeliveryQueued,
		invitation.Locale)
	if err != nil {
		return fmt.Errorf("create invitation: %w", err)
	}
	return nil
}

func enqueueInvitationEmail(ctx context.Context, tx pgx.Tx, invitation domain.Invitation) error {
	jobID, err := newUUID()
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO outbox_jobs (id, tenant_id, kind, invitation_id, status)
		VALUES ($1, $2, $3, $4, $5)
	`, jobID, invitation.TenantID, outboxJobInvitationEmail, invitation.ID, outboxStatusPending)
	if err != nil {
		return fmt.Errorf("enqueue invitation email: %w", err)
	}
	return nil
}

func (repository *Store) FindInvitation(
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

func (repository *Store) AcceptInvitation(
	ctx context.Context,
	acceptance domain.PasswordInvitationAcceptance,
) (domain.User, domain.Membership, error) {
	return repository.acceptInvitation(
		ctx,
		invitationAcceptance{
			invitation: acceptance.Invitation,
			user:       acceptance.User, passwordHash: acceptance.PasswordHash,
			existingUser: acceptance.ExistingUser,
		},
	)
}

func (repository *Store) AcceptExternalInvitation(
	ctx context.Context,
	acceptance domain.ExternalInvitationAcceptance,
) (domain.User, domain.Membership, error) {
	return repository.acceptInvitation(
		ctx,
		invitationAcceptance{
			invitation: acceptance.Invitation,
			user:       acceptance.User, identity: new(acceptance.Identity),
			existingUser: acceptance.ExistingUser,
		},
	)
}

type invitationAcceptance struct {
	invitation   domain.Invitation
	user         domain.User
	passwordHash domain.PasswordHash
	existingUser bool
	identity     *domain.ExternalIdentity
}

type acceptedInvitation struct {
	user       domain.User
	membership domain.Membership
}

func (repository *Store) acceptInvitation(
	ctx context.Context,
	acceptance invitationAcceptance,
) (domain.User, domain.Membership, error) {
	var accepted acceptedInvitation

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			var err error
			accepted, err = acceptInvitationTx(ctx, tx, acceptance)
			return err
		},
	)

	return accepted.user, accepted.membership, err
}

func acceptInvitationTx(ctx context.Context, tx pgx.Tx, acceptance invitationAcceptance) (acceptedInvitation, error) {
	invitation, err := lockedInvitation(ctx, tx, acceptance.invitation.TokenHash)
	if err != nil {
		return acceptedInvitation{}, err
	}
	if invitation.Email != acceptance.user.Email {
		return acceptedInvitation{}, domain.NewError(domain.ErrorInviteEmailMismatch)
	}

	user, err := acceptIdentity(ctx, tx, acceptance.user, acceptance.passwordHash, acceptance.existingUser)
	if err != nil {
		return acceptedInvitation{}, err
	}
	if acceptance.identity != nil {
		if err := linkInvitationIdentity(ctx, tx, user, *acceptance.identity); err != nil {
			return acceptedInvitation{}, err
		}
	}
	membership, err := createMembership(ctx, tx, invitation, user.ID)
	if err != nil {
		return acceptedInvitation{}, err
	}
	if acceptance.existingUser {
		if err := tx.QueryRow(ctx, `
			UPDATE users
			SET session_version = session_version + 1, updated_at = now()
			WHERE id = $1
			RETURNING session_version
		`, user.ID).Scan(&user.SessionVersion); err != nil {
			return acceptedInvitation{}, fmt.Errorf("rotate accepted user session: %w", err)
		}
	}
	if err := markInvitationUsed(ctx, tx, invitation.ID); err != nil {
		return acceptedInvitation{}, err
	}
	if err := insertAuditEvent(ctx, tx, domain.AuditEvent{
		ActorID: new(user.ID), TenantID: new(invitation.TenantID),
		Action: "invitation.accepted", Target: string(user.Email),
	}); err != nil {
		return acceptedInvitation{}, err
	}
	return acceptedInvitation{user: user, membership: membership}, nil
}

func linkInvitationIdentity(ctx context.Context, tx pgx.Tx, user domain.User, identity domain.ExternalIdentity) error {
	if identity.Email != user.Email {
		return domain.NewError(domain.ErrorInviteEmailMismatch)
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO external_identities (issuer, subject, user_id, email)
		VALUES ($1, $2, $3, $4)
	`, identity.Issuer, identity.Subject, user.ID, identity.Email)
	if err != nil {
		return constraintConflict(fmt.Errorf("link invitation external identity: %w", err))
	}
	return nil
}

func markInvitationUsed(ctx context.Context, tx pgx.Tx, invitationID domain.InvitationID) error {
	result, err := tx.Exec(ctx, `
		UPDATE invitations SET used_at = now()
		WHERE id = $1 AND used_at IS NULL
	`, invitationID)
	if err != nil {
		return fmt.Errorf("mark invitation as used: %w", err)
	}
	if result.RowsAffected() != 1 {
		return domain.NewError(domain.ErrorInvitationUsed)
	}
	return nil
}

const invitationSelect = `
	SELECT
		invitation.id,
		invitation.tenant_id,
		invitation.email,
		invitation.role_id,
		COALESCE(invitation.token_hash, ''),
		invitation.expires_at,
		invitation.used_at,
		invitation.revoked_at,
		invitation.created_by,
		invitation.delivery_status,
		invitation.delivery_locale
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
		&invitation.RevokedAt,
		&invitation.CreatedBy,
		&invitation.DeliveryStatus,
		&invitation.Locale,
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
				revoked_at,
				created_by,
				delivery_status,
				delivery_locale,
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
		&invitation.RevokedAt,
		&invitation.CreatedBy,
		&invitation.DeliveryStatus,
		&invitation.Locale,
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

	if invitation.RevokedAt != nil {
		return domain.Invitation{}, domain.NewError(domain.ErrorInvitationInvalid)
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
	user domain.User,
	passwordHash domain.PasswordHash,
	existingUser bool,
) (domain.User, error) {
	if existingUser {
		if !user.ID.IsValid() {
			return domain.User{}, domain.NewError(domain.ErrorValidation)
		}

		var stored domain.User
		err := tx.QueryRow(ctx, `
			SELECT id, email, global_role, locale, session_version
			FROM users
			WHERE id = $1
			FOR UPDATE
		`, user.ID).Scan(
			&stored.ID,
			&stored.Email,
			&stored.GlobalRole,
			&stored.Locale,
			&stored.SessionVersion,
		)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.NewError(domain.ErrorUserNotFound)
		}
		if err != nil {
			return domain.User{}, fmt.Errorf("resolve accepted user: %w", err)
		}
		if stored.Email != user.Email || stored.GlobalRole.IsSuperAdministrator() {
			return domain.User{}, domain.NewError(domain.ErrorUnauthorized)
		}
		return stored, nil
	}

	id, err := newUUID()
	if err != nil {
		return domain.User{}, err
	}

	user.ID = domain.UserID(id)
	user.GlobalRole = domain.GlobalRoleUser

	var storedPasswordHash any
	if passwordHash != "" {
		storedPasswordHash = passwordHash
	}

	_, err = tx.Exec(
		ctx,
		`
			INSERT INTO users (
				id,
				email,
				password_hash,
				global_role,
				locale,
				session_version
			)
			VALUES ($1, $2, $3, $4, $5, $6)
		`,
		user.ID,
		user.Email,
		storedPasswordHash,
		user.GlobalRole,
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
	membership, err := invitationMembership(ctx, tx, invitation, userID)
	if err != nil {
		return domain.Membership{}, err
	}

	var existingStatus domain.MembershipStatus
	err = tx.QueryRow(ctx, `
		SELECT id, status, revision, created_at, updated_at
		FROM tenant_memberships
		WHERE tenant_id = $1 AND user_id = $2
		FOR UPDATE
	`, invitation.TenantID, userID).Scan(
		&membership.ID,
		&existingStatus,
		&membership.Revision,
		&membership.CreatedAt,
		&membership.UpdatedAt,
	)
	switch {
	case err == nil && existingStatus == domain.MembershipActive:
		return domain.Membership{}, domain.NewError(domain.ErrorConflict)
	case err == nil:
		err = tx.QueryRow(ctx, `
			UPDATE tenant_memberships
			SET role_id = $3, status = $4, revision = revision + 1, updated_at = now()
			WHERE tenant_id = $1 AND user_id = $2 AND status = $5
			RETURNING revision, updated_at
		`, invitation.TenantID, userID, invitation.RoleID, domain.MembershipActive,
			domain.MembershipInactive).Scan(&membership.Revision, &membership.UpdatedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Membership{}, domain.NewError(domain.ErrorConflict)
		}
		if err != nil {
			return domain.Membership{}, fmt.Errorf("reactivate invitation membership: %w", err)
		}
		membership.Status = domain.MembershipActive
		return membership, nil
	case !errors.Is(err, pgx.ErrNoRows):
		return domain.Membership{}, fmt.Errorf("find invitation membership: %w", err)
	}

	id, err := newUUID()
	if err != nil {
		return domain.Membership{}, err
	}
	membership.ID = domain.MembershipID(id)
	membership.Status = domain.MembershipActive
	if err := insertInvitationMembership(ctx, tx, membership); err != nil {
		return domain.Membership{}, err
	}
	membership.Revision = 1
	return membership, nil
}

func invitationMembership(
	ctx context.Context,
	tx pgx.Tx,
	invitation domain.Invitation,
	userID domain.UserID,
) (domain.Membership, error) {
	membership := domain.Membership{
		UserID: userID, RoleID: invitation.RoleID,
		Status: domain.MembershipActive,
	}
	var permissions []string

	err := tx.QueryRow(
		ctx,
		`
			SELECT
				tenant.id,
				tenant.name,
				tenant.revision,
				role.id,
				role.tenant_id,
				role.name,
				role.kind,
				role.revision,
				role.created_at,
				role.updated_at,
				COALESCE(
					array_agg(permission.permission ORDER BY permission.permission)
						FILTER (WHERE permission.permission IS NOT NULL),
					ARRAY[]::text[]
				)
			FROM tenants tenant
			JOIN tenant_roles role
				ON role.tenant_id = tenant.id
			LEFT JOIN tenant_role_permissions permission
				ON permission.role_id = role.id
			WHERE
				tenant.id = $1
				AND role.id = $2
			GROUP BY tenant.id, role.id
		`,
		invitation.TenantID,
		invitation.RoleID,
	).Scan(
		&membership.Tenant.ID,
		&membership.Tenant.Name,
		&membership.Tenant.Revision,
		&membership.Role.ID,
		&membership.Role.TenantID,
		&membership.Role.Name,
		&membership.Role.Kind,
		&membership.Role.Revision,
		&membership.Role.CreatedAt,
		&membership.Role.UpdatedAt,
		&permissions,
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

	membership.Role.Permissions = make(
		[]domain.Permission,
		len(permissions),
	)
	for index, permission := range permissions {
		membership.Role.Permissions[index] = domain.Permission(permission)
	}
	return membership, nil
}

func insertInvitationMembership(ctx context.Context, tx pgx.Tx, membership domain.Membership) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO tenant_memberships (id, tenant_id, user_id, role_id, status)
		VALUES ($1, $2, $3, $4, $5)
	`, membership.ID, membership.Tenant.ID, membership.UserID, membership.RoleID, membership.Status)
	if err != nil {
		return constraintConflict(
			fmt.Errorf(
				"create invitation membership: %w",
				err,
			),
		)
	}
	return nil
}
