package clinks

import (
	"context"
)

type InvitationAdmin struct {
	invitations InvitationAdminStore
}

func NewInvitationAdmin(invitations InvitationAdminStore) *InvitationAdmin {
	return &InvitationAdmin{invitations: invitations}
}

func (administration *InvitationAdmin) ListInvitations(ctx context.Context, filter InvitationFilter) (Page[Invitation], error) {
	filter, err := filter.Normalized()
	if err != nil {
		return Page[Invitation]{}, err
	}
	return administration.invitations.ListInvitations(ctx, filter)
}

func (administration *InvitationAdmin) RevokeInvitation(ctx context.Context, invitationID InvitationID, actorID UserID) error {
	if !invitationID.IsValid() || !actorID.IsValid() {
		return NewError(ErrorValidation)
	}
	return administration.invitations.RevokeInvitation(ctx, invitationID, actorID)
}
