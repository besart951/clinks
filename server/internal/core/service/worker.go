package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

const (
	invitationPollInterval    = 2 * time.Second
	invitationCleanupInterval = 24 * time.Hour
	invitationRetentionDays   = 30
)

type InvitationWorker struct {
	outbox   ports.OutboxRepository
	mailer   ports.InvitationMailer
	tokens   ports.InvitationTokenSigner
	links    invitationLinkBuilder
	messages ports.MessageCatalog
	now      func() time.Time
}

func NewInvitationWorker(
	outbox ports.OutboxRepository,
	mailer ports.InvitationMailer,
	tokens ports.InvitationTokenSigner,
	messages ports.MessageCatalog,
	inviteBaseURL string,
) (*InvitationWorker, error) {
	switch {
	case outbox == nil:
		return nil, errors.New("invitation worker: outbox dependency is required")
	case mailer == nil:
		return nil, errors.New("invitation worker: mailer dependency is required")
	case tokens == nil:
		return nil, errors.New("invitation worker: token dependency is required")
	case messages == nil:
		return nil, errors.New("invitation worker: message catalog dependency is required")
	}
	links, err := newInvitationLinkBuilder(inviteBaseURL)
	if err != nil {
		return nil, err
	}

	return &InvitationWorker{
		outbox:   outbox,
		mailer:   mailer,
		tokens:   tokens,
		links:    links,
		messages: messages,
		now:      time.Now,
	}, nil
}

func (worker *InvitationWorker) Run(
	ctx context.Context,
) error {
	if err := worker.cleanupExpired(ctx); err != nil {
		return err
	}

	if err := worker.drain(ctx); err != nil {
		return err
	}

	pollTicker := time.NewTicker(
		invitationPollInterval,
	)
	defer pollTicker.Stop()

	cleanupTicker := time.NewTicker(
		invitationCleanupInterval,
	)
	defer cleanupTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()

		case <-pollTicker.C:
			if err := worker.drain(ctx); err != nil {
				return err
			}

		case <-cleanupTicker.C:
			if err := worker.cleanupExpired(ctx); err != nil {
				return err
			}
		}
	}
}

func (worker *InvitationWorker) RunOnce(
	ctx context.Context,
) (bool, error) {
	job, invitation, err := worker.outbox.ClaimInvitationEmail(ctx)
	if err != nil {
		return false,
			fmt.Errorf(
				"claim invitation email: %w",
				err,
			)
	}

	if job.ID == "" {
		return false, nil
	}

	token, err := worker.tokens.Token(invitation)
	if err != nil {
		return true, worker.retry(
			ctx,
			job,
			fmt.Errorf(
				"create invitation token: %w",
				err,
			),
		)
	}

	invitation.Acceptance = worker.links.URL(token)

	message, err := worker.invitationMessage(ctx, invitation)
	if err != nil {
		return true, worker.retry(ctx, job, err)
	}

	err = worker.mailer.Send(
		ctx,
		message,
	)
	if err != nil {
		return true, worker.retry(
			ctx,
			job,
			fmt.Errorf(
				"send invitation email: %w",
				err,
			),
		)
	}

	if err := worker.outbox.Complete(
		ctx,
		job,
	); err != nil {
		if errors.Is(err, domain.NewError(domain.ErrorLeaseLost)) {
			return true, nil
		}
		return true,
			fmt.Errorf(
				"complete invitation job %s: %w",
				job.ID,
				err,
			)
	}

	return true, nil
}

func (worker *InvitationWorker) invitationMessage(
	ctx context.Context,
	invitation domain.Invitation,
) (domain.InvitationMessage, error) {
	locale := invitation.Locale
	if !locale.IsValid() {
		var err error
		locale, err = worker.messages.DefaultLocale(ctx)
		if err != nil {
			return domain.InvitationMessage{}, fmt.Errorf("load invitation default locale: %w", err)
		}
	}

	subject, err := worker.localizedMessage(ctx, locale, "mail.invitation.subject")
	if err != nil {
		return domain.InvitationMessage{}, err
	}
	body, err := worker.localizedMessage(ctx, locale, "mail.invitation.body")
	if err != nil {
		return domain.InvitationMessage{}, err
	}
	body = strings.ReplaceAll(body, "{url}", strings.TrimSpace(invitation.Acceptance))

	return domain.InvitationMessage{
		Recipient: invitation.Email,
		Subject:   subject,
		Body:      body,
	}, nil
}

func (worker *InvitationWorker) localizedMessage(
	ctx context.Context,
	locale domain.Locale,
	key string,
) (string, error) {
	message, err := worker.messages.Message(ctx, locale, key)
	if err == nil {
		return message, nil
	}

	defaultLocale, defaultErr := worker.messages.DefaultLocale(ctx)
	if defaultErr != nil {
		return "", errors.Join(err, defaultErr)
	}
	message, defaultErr = worker.messages.Message(ctx, defaultLocale, key)
	if defaultErr != nil {
		return "", errors.Join(err, defaultErr)
	}
	return message, nil
}

func (worker *InvitationWorker) drain(
	ctx context.Context,
) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}

		processed, err := worker.RunOnce(ctx)
		if err != nil {
			return err
		}

		if !processed {
			return nil
		}
	}
}

func (worker *InvitationWorker) retry(
	ctx context.Context,
	job domain.OutboxJob,
	cause error,
) error {
	if err := worker.outbox.Retry(
		ctx,
		job,
		cause,
	); err != nil {
		if errors.Is(err, domain.NewError(domain.ErrorLeaseLost)) {
			return nil
		}
		return errors.Join(
			cause,
			fmt.Errorf(
				"schedule invitation job retry: %w",
				err,
			),
		)
	}

	return nil
}

func (worker *InvitationWorker) cleanupExpired(
	ctx context.Context,
) error {
	cutoff := worker.now().
		UTC().
		AddDate(
			0,
			0,
			-invitationRetentionDays,
		)

	if _, err := worker.outbox.AnonymizeExpiredInvitations(
		ctx,
		cutoff,
	); err != nil {
		return fmt.Errorf(
			"anonymize expired invitations: %w",
			err,
		)
	}

	return nil
}
