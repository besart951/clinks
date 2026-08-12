package clinks

import (
	"context"
	"time"
)

type InvitationStore interface {
	CreateInvitation(
		ctx context.Context,
		invitation Invitation,
	) (Invitation, error)

	FindInvitation(
		ctx context.Context,
		hash InvitationHash,
	) (Invitation, error)

	AcceptInvitation(
		ctx context.Context,
		acceptance PasswordInvitationAcceptance,
	) (User, Membership, error)

	AcceptExternalInvitation(
		ctx context.Context,
		acceptance ExternalInvitationAcceptance,
	) (User, Membership, error)
}

type InvitationMailer interface {
	Send(
		ctx context.Context,
		message InvitationMessage,
	) error
}

type InvitationIDGenerator interface {
	NewInvitationID() (
		InvitationID,
		error,
	)
}

type InvitationTokenSigner interface {
	Token(
		invitation Invitation,
	) (string, error)
}

type OutboxStore interface {
	ClaimInvitationEmail(
		ctx context.Context,
	) (OutboxJob, Invitation, error)

	Complete(
		ctx context.Context,
		job OutboxJob,
	) error

	Retry(
		ctx context.Context,
		job OutboxJob,
		cause error,
	) error

	AnonymizeExpiredInvitations(
		ctx context.Context,
		before time.Time,
	) (int, error)
}
