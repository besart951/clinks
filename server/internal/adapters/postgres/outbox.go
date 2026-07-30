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

const invitationEmailJobKind = "invitation.email"

type OutboxRepository struct {
	pool *pgxpool.Pool
}

func NewOutboxRepository(pool *pgxpool.Pool) *OutboxRepository {
	return &OutboxRepository{pool: pool}
}

func (repository *OutboxRepository) ClaimInvitationEmail(ctx context.Context) (domain.OutboxJob, domain.Invitation, error) {
	var job domain.OutboxJob
	var invitation domain.Invitation
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `WITH candidate AS (
			SELECT id FROM outbox_jobs
			WHERE kind = $1 AND (
				(status = 'pending' AND available_at <= now())
				OR (status = 'processing' AND locked_at < now() - interval '10 minutes')
			)
			ORDER BY available_at, created_at
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		UPDATE outbox_jobs job
		SET status = 'processing', attempts = attempts + 1, locked_at = now()
		FROM candidate
		WHERE job.id = candidate.id
		RETURNING job.id, job.tenant_id, job.invitation_id, job.attempts`, invitationEmailJobKind)
		if err := row.Scan(&job.ID, &job.TenantID, &job.InvitationID, &job.Attempts); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `SELECT id, tenant_id, email, role, token_hash, expires_at, used_at, created_by
			FROM invitations WHERE id = $1`, job.InvitationID).Scan(
			&invitation.ID, &invitation.TenantID, &invitation.Email, &invitation.Role,
			&invitation.TokenHash, &invitation.ExpiresAt, &invitation.UsedAt, &invitation.CreatedBy,
		)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.OutboxJob{}, domain.Invitation{}, nil
	}
	return job, invitation, err
}

func (repository *OutboxRepository) Complete(ctx context.Context, jobID domain.OutboxJobID) error {
	return repository.updateJob(ctx, jobID, `UPDATE outbox_jobs
		SET status = 'completed', completed_at = now(), last_error = NULL
		WHERE id = $1`, nil)
}

func (repository *OutboxRepository) Retry(ctx context.Context, jobID domain.OutboxJobID, attempts int, jobErr error) error {
	status := "pending"
	var availableAt any = time.Now().Add(retryDelay(attempts))
	if attempts >= 5 {
		status = "dead_letter"
		availableAt = nil
	}
	return withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		if status == "dead_letter" {
			var tenantID domain.TenantID
			err := tx.QueryRow(ctx, `UPDATE outbox_jobs
				SET status = $2, dead_lettered_at = now(), last_error = $3
				WHERE id = $1
				RETURNING tenant_id`, jobID, status, jobErr.Error()).Scan(&tenantID)
			if err != nil {
				return err
			}
			event := domain.AuditEvent{TenantID: &tenantID, Action: "outbox.dead_letter", Target: string(jobID)}
			return insertAuditEvent(ctx, tx, &event)
		}
		_, err := tx.Exec(ctx, `UPDATE outbox_jobs
			SET status = $2, available_at = $3, locked_at = NULL, last_error = $4
			WHERE id = $1`, jobID, status, availableAt, jobErr.Error())
		return err
	})
}

func (repository *OutboxRepository) AnonymizeExpiredInvitations(ctx context.Context, before time.Time) (int, error) {
	var affected int
	err := withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		result, err := tx.Exec(ctx, `UPDATE invitations
			SET email = '', token_hash = '', anonymized_at = now()
			WHERE anonymized_at IS NULL AND (expires_at < $1 OR used_at < $1)`, before)
		if err != nil {
			return fmt.Errorf("anonymize invitations: %w", err)
		}
		affected = int(result.RowsAffected())
		return nil
	})
	return affected, err
}

func (repository *OutboxRepository) updateJob(ctx context.Context, jobID domain.OutboxJobID, query string, values []any) error {
	return withSystemTx(ctx, repository.pool, func(tx pgx.Tx) error {
		arguments := append([]any{jobID}, values...)
		_, err := tx.Exec(ctx, query, arguments...)
		return err
	})
}

func retryDelay(attempts int) time.Duration {
	if attempts < 1 {
		attempts = 1
	}
	delay := time.Minute * time.Duration(1<<(attempts-1))
	if delay > time.Hour {
		return time.Hour
	}
	return delay
}
