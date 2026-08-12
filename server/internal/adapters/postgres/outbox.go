package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type (
	outboxJobKind string
	outboxStatus  string
)

const (
	outboxJobInvitationEmail outboxJobKind = "invitation.email"

	outboxStatusPending    outboxStatus = "pending"
	outboxStatusProcessing outboxStatus = "processing"
	outboxStatusCompleted  outboxStatus = "completed"
	outboxStatusDeadLetter outboxStatus = "dead_letter"

	outboxMaximumAttempts = 5
	outboxLockSeconds     = 10 * 60
)

func (repository *Store) ClaimInvitationEmail(
	ctx context.Context,
) (domain.OutboxJob, domain.Invitation, error) {
	var job domain.OutboxJob
	var invitation domain.Invitation

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			leaseToken, err := newUUID()
			if err != nil {
				return err
			}

			err = tx.QueryRow(
				ctx,
				`
					WITH candidate AS (
						SELECT id
						FROM outbox_jobs
						WHERE
							kind = $1
							AND (
								(
									status = $2
									AND available_at <= now()
								)
								OR (
									status = $3
									AND locked_at <
										now() -
										make_interval(secs => $4)
								)
							)
						ORDER BY
							available_at,
							created_at,
							id
						FOR UPDATE SKIP LOCKED
						LIMIT 1
					)
					UPDATE outbox_jobs job
					SET
						status = $3,
						attempts = attempts + 1,
						locked_at = now(),
						lease_token = $5,
						updated_at = now()
					FROM candidate
					WHERE job.id = candidate.id
					RETURNING
						job.id,
						job.tenant_id,
						job.invitation_id,
						job.attempts,
						job.lease_token
				`,
				outboxJobInvitationEmail,
				outboxStatusPending,
				outboxStatusProcessing,
				outboxLockSeconds,
				leaseToken,
			).Scan(
				&job.ID,
				&job.TenantID,
				&job.InvitationID,
				&job.Attempts,
				&job.LeaseToken,
			)
			if err != nil {
				return err
			}

			return tx.QueryRow(
				ctx,
				invitationSelect+`
					WHERE invitation.id = $1
				`,
				job.InvitationID,
			).Scan(
				invitationScanTargets(
					&invitation,
				)...,
			)
		},
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return domain.OutboxJob{},
			domain.Invitation{},
			nil
	}

	if err != nil {
		return domain.OutboxJob{},
			domain.Invitation{},
			fmt.Errorf(
				"claim invitation email: %w",
				err,
			)
	}

	return job, invitation, nil
}

func (repository *Store) Complete(
	ctx context.Context,
	job domain.OutboxJob,
) error {
	if !job.ID.IsValid() || !job.LeaseToken.IsValid() {
		return domain.NewError(domain.ErrorValidation)
	}

	return withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			var invitationID domain.InvitationID

			err := tx.QueryRow(
				ctx,
				`
					UPDATE outbox_jobs
					SET
						status = $2,
						completed_at = now(),
						locked_at = NULL,
						lease_token = NULL,
						last_error = NULL,
						updated_at = now()
					WHERE id = $1 AND lease_token = $3 AND status = $4
					RETURNING invitation_id
				`,
				job.ID,
				outboxStatusCompleted,
				job.LeaseToken,
				outboxStatusProcessing,
			).Scan(&invitationID)
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.NewError(domain.ErrorLeaseLost)
			}
			if err != nil {
				return fmt.Errorf(
					"complete outbox job: %w",
					err,
				)
			}

			_, err = tx.Exec(
				ctx,
				`
					UPDATE invitations
					SET delivery_status = $2
					WHERE id = $1
				`,
				invitationID,
				domain.InvitationDeliverySent,
			)

			return err
		},
	)
}

func (repository *Store) Retry(
	ctx context.Context,
	job domain.OutboxJob,
	jobErr error,
) error {
	if jobErr == nil {
		return errors.New(
			"retry outbox job: cause is required",
		)
	}

	if !job.ID.IsValid() || !job.LeaseToken.IsValid() {
		return domain.NewError(domain.ErrorValidation)
	}

	if job.Attempts >= outboxMaximumAttempts {
		return repository.deadLetter(
			ctx,
			job,
			jobErr,
		)
	}

	availableAt := time.Now().Add(
		retryDelay(job.Attempts),
	)

	return withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			var invitationID domain.InvitationID

			err := tx.QueryRow(
				ctx,
				`
					UPDATE outbox_jobs
					SET
						status = $2,
						available_at = $3,
						locked_at = NULL,
						lease_token = NULL,
						last_error = $4,
						updated_at = now()
					WHERE id = $1 AND lease_token = $5 AND status = $6
					RETURNING invitation_id
				`,
				job.ID,
				outboxStatusPending,
				availableAt,
				jobErr.Error(),
				job.LeaseToken,
				outboxStatusProcessing,
			).Scan(&invitationID)
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.NewError(domain.ErrorLeaseLost)
			}
			if err != nil {
				return fmt.Errorf(
					"schedule outbox retry: %w",
					err,
				)
			}

			_, err = tx.Exec(
				ctx,
				`
					UPDATE invitations
					SET delivery_status = $2
					WHERE id = $1
				`,
				invitationID,
				domain.InvitationDeliveryRetrying,
			)

			return err
		},
	)
}

func (repository *Store) deadLetter(
	ctx context.Context,
	job domain.OutboxJob,
	jobErr error,
) error {
	return withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			var (
				tenantID     domain.TenantID
				invitationID domain.InvitationID
			)

			err := tx.QueryRow(
				ctx,
				`
					UPDATE outbox_jobs
					SET
						status = $2,
						dead_lettered_at = now(),
						locked_at = NULL,
						lease_token = NULL,
						last_error = $3,
						updated_at = now()
					WHERE id = $1 AND lease_token = $4 AND status = $5
					RETURNING
						tenant_id,
						invitation_id
				`,
				job.ID,
				outboxStatusDeadLetter,
				jobErr.Error(),
				job.LeaseToken,
				outboxStatusProcessing,
			).Scan(
				&tenantID,
				&invitationID,
			)
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.NewError(domain.ErrorLeaseLost)
			}
			if err != nil {
				return fmt.Errorf(
					"dead-letter outbox job: %w",
					err,
				)
			}

			if _, err := tx.Exec(
				ctx,
				`
					UPDATE invitations
					SET delivery_status = $2
					WHERE id = $1
				`,
				invitationID,
				domain.InvitationDeliveryFailed,
			); err != nil {
				return fmt.Errorf(
					"mark invitation delivery failed: %w",
					err,
				)
			}

			return insertAuditEvent(
				ctx,
				tx,
				domain.AuditEvent{
					TenantID: new(tenantID),
					Action:   "outbox.dead_letter",
					Target:   string(job.ID),
				},
			)
		},
	)
}

func (repository *Store) AnonymizeExpiredInvitations(
	ctx context.Context,
	before time.Time,
) (int, error) {
	var affected int64

	err := withSystemTx(
		ctx,
		repository.pool,
		func(tx pgx.Tx) error {
			result, err := tx.Exec(
				ctx,
				`
					UPDATE invitations
					SET
						email = '',
						token_hash = NULL,
						anonymized_at = now()
					WHERE
						anonymized_at IS NULL
						AND (
							expires_at < $1
							OR used_at < $1
						)
				`,
				before,
			)
			if err != nil {
				return fmt.Errorf(
					"anonymize invitations: %w",
					err,
				)
			}

			affected = result.RowsAffected()

			return nil
		},
	)

	return int(affected), err
}

func retryDelay(
	attempts int,
) time.Duration {
	attempts = max(attempts, 1)

	exponent := min(
		attempts-1,
		6,
	)

	delay := time.Minute *
		time.Duration(1<<exponent)

	return min(delay, time.Hour)
}
