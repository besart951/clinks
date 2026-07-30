package ports

import (
	"context"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type InvitationMailer interface {
	Send(context.Context, *domain.Invitation) (string, error)
}

type InvitationTokenSigner interface {
	NewInvitationID() (domain.InvitationID, error)
	Token(*domain.Invitation) (string, error)
}

type OutboxRepository interface {
	ClaimInvitationEmail(context.Context) (domain.OutboxJob, domain.Invitation, error)
	Complete(context.Context, domain.OutboxJobID) error
	Retry(context.Context, domain.OutboxJobID, int, error) error
	AnonymizeExpiredInvitations(context.Context, time.Time) (int, error)
}
