package domain

import "time"

type (
	InvitationID     string
	InvitationToken  string
	InvitationHash   string
	OutboxJobID      string
	InvitationStatus string
)

const (
	InvitationStatusPending InvitationStatus = "pending"
	InvitationStatusUsed    InvitationStatus = "used"
	InvitationStatusExpired InvitationStatus = "expired"
)

type InvitationDeliveryStatus string

const (
	InvitationDeliveryQueued   InvitationDeliveryStatus = "queued"
	InvitationDeliveryRetrying InvitationDeliveryStatus = "retrying"
	InvitationDeliverySent     InvitationDeliveryStatus = "sent"
	InvitationDeliveryFailed   InvitationDeliveryStatus = "failed"
)

type Invitation struct {
	ID             InvitationID
	TenantID       TenantID
	Email          Email
	RoleID         RoleID
	TokenHash      InvitationHash
	ExpiresAt      time.Time
	UsedAt         *time.Time
	CreatedBy      UserID
	Acceptance     string
	DeliveryStatus InvitationDeliveryStatus
}

func (invitation Invitation) Status(now time.Time) InvitationStatus {
	if invitation.IsUsed() {
		return InvitationStatusUsed
	}

	if invitation.IsExpired(now) {
		return InvitationStatusExpired
	}

	return InvitationStatusPending
}

func (invitation Invitation) IsExpired(now time.Time) bool {
	return !now.Before(invitation.ExpiresAt)
}

func (invitation Invitation) IsUsed() bool {
	return invitation.UsedAt != nil
}
