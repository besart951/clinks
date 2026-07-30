package domain

import "time"

type (
	InvitationID    string
	InvitationToken string
	InvitationHash  string
	OutboxJobID     string
)

type Invitation struct {
	ID             InvitationID
	TenantID       TenantID
	Email          Email
	Role           Role
	TokenHash      InvitationHash
	ExpiresAt      time.Time
	UsedAt         *time.Time
	CreatedBy      UserID
	Acceptance     string
	DeliveryStatus string
}

type InvitationAcceptance struct {
	Invitation Invitation
	User       User
	Password   *PasswordHash
}

type OutboxJob struct {
	ID           OutboxJobID
	TenantID     TenantID
	InvitationID InvitationID
	Attempts     int
}
