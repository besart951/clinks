package ports

import (
	"context"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type InvitationRepository interface {
	CreateInvitation(
		ctx context.Context,
		invitation domain.Invitation,
	) (domain.Invitation, error)

	FindInvitation(
		ctx context.Context,
		hash domain.InvitationHash,
	) (domain.Invitation, error)

	AcceptInvitation(
		ctx context.Context,
		acceptance domain.PasswordInvitationAcceptance,
	) (domain.User, domain.Membership, error)

	AcceptExternalInvitation(
		ctx context.Context,
		acceptance domain.ExternalInvitationAcceptance,
	) (domain.User, domain.Membership, error)
}

type InvitationMailer interface {
	Send(
		ctx context.Context,
		message domain.InvitationMessage,
	) error
}

type InvitationIDGenerator interface {
	NewInvitationID() (
		domain.InvitationID,
		error,
	)
}

type InvitationTokenSigner interface {
	Token(
		invitation domain.Invitation,
	) (string, error)
}

type OutboxRepository interface {
	ClaimInvitationEmail(
		ctx context.Context,
	) (domain.OutboxJob, domain.Invitation, error)

	Complete(
		ctx context.Context,
		job domain.OutboxJob,
	) error

	Retry(
		ctx context.Context,
		job domain.OutboxJob,
		cause error,
	) error

	AnonymizeExpiredInvitations(
		ctx context.Context,
		before time.Time,
	) (int, error)
}
