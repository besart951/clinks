package service

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type InvitationAdministration struct {
	invitations ports.InvitationAdministration
}

func NewInvitationAdministration(invitations ports.InvitationAdministration) *InvitationAdministration {
	return &InvitationAdministration{invitations: invitations}
}

func (administration *InvitationAdministration) ListInvitations(ctx context.Context, filter domain.InvitationFilter) (domain.Page[domain.Invitation], error) {
	filter, err := filter.Normalized()
	if err != nil {
		return domain.Page[domain.Invitation]{}, err
	}
	return administration.invitations.ListInvitations(ctx, filter)
}

func (administration *InvitationAdministration) RevokeInvitation(ctx context.Context, invitationID domain.InvitationID, actorID domain.UserID) error {
	if !invitationID.IsValid() || !actorID.IsValid() {
		return domain.NewError(domain.ErrorValidation)
	}
	return administration.invitations.RevokeInvitation(ctx, invitationID, actorID)
}
