package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type InvitationWorker struct {
	outbox        ports.OutboxRepository
	mailer        ports.InvitationMailer
	tokens        ports.InvitationTokenSigner
	inviteBaseURL string
}

func NewInvitationWorker(outbox ports.OutboxRepository, mailer ports.InvitationMailer, tokens ports.InvitationTokenSigner, inviteBaseURL string) *InvitationWorker {
	return &InvitationWorker{outbox: outbox, mailer: mailer, tokens: tokens, inviteBaseURL: strings.TrimRight(inviteBaseURL, "/")}
}

func (worker *InvitationWorker) Run(ctx context.Context) error {
	if _, err := worker.outbox.AnonymizeExpiredInvitations(ctx, time.Now().AddDate(0, 0, -30)); err != nil {
		return fmt.Errorf("anonymize expired invitations: %w", err)
	}
	poll := time.NewTicker(2 * time.Second)
	cleanup := time.NewTicker(24 * time.Hour)
	defer poll.Stop()
	defer cleanup.Stop()
	for {
		if _, err := worker.RunOnce(ctx); err != nil {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-poll.C:
		case <-cleanup.C:
			if _, err := worker.outbox.AnonymizeExpiredInvitations(ctx, time.Now().AddDate(0, 0, -30)); err != nil {
				return err
			}
		}
	}
}

func (worker *InvitationWorker) RunOnce(ctx context.Context) (bool, error) {
	job, invitation, err := worker.outbox.ClaimInvitationEmail(ctx)
	if err != nil {
		return false, fmt.Errorf("claim invitation email: %w", err)
	}
	if job.ID == "" {
		return false, nil
	}
	token, err := worker.tokens.Token(&invitation)
	if err == nil {
		invitation.Acceptance = worker.inviteBaseURL + "/invite?token=" + token
		status, sendErr := worker.mailer.Send(ctx, &invitation)
		if sendErr != nil {
			err = sendErr
		} else if status != "sent" {
			err = fmt.Errorf("invitation delivery status: %s", status)
		}
	}
	if err != nil {
		return true, worker.outbox.Retry(ctx, job.ID, job.Attempts, err)
	}
	return true, worker.outbox.Complete(ctx, job.ID)
}
