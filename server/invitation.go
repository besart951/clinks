package clinks

import "time"

type (
	InvitationID     string
	InvitationToken  string
	InvitationHash   string
	OutboxJobID      string
	OutboxLeaseToken string
	InvitationStatus string
)

const (
	InvitationStatusPending InvitationStatus = "pending"
	InvitationStatusUsed    InvitationStatus = "used"
	InvitationStatusExpired InvitationStatus = "expired"
	InvitationStatusRevoked InvitationStatus = "revoked"
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
	Role           Role
	TokenHash      InvitationHash
	ExpiresAt      time.Time
	UsedAt         *time.Time
	RevokedAt      *time.Time
	CreatedBy      UserID
	Acceptance     string
	DeliveryStatus InvitationDeliveryStatus
	Locale         Locale
	CreatedAt      time.Time
}

type PasswordInvitationAcceptance struct {
	Invitation   Invitation
	User         User
	PasswordHash PasswordHash
	ExistingUser bool
}

type ExternalInvitationAcceptance struct {
	Invitation   Invitation
	User         User
	Identity     ExternalIdentity
	ExistingUser bool
}

type OutboxJob struct {
	ID           OutboxJobID
	TenantID     TenantID
	InvitationID InvitationID
	Attempts     int
	LeaseToken   OutboxLeaseToken
}

type InvitationMessage struct {
	Recipient Email
	Subject   string
	Body      string
}

func (invitationID InvitationID) IsValid() bool {
	return validUUID(string(invitationID))
}

func (invitationID InvitationID) Validate() error {
	if !invitationID.IsValid() {
		return NewError(ErrorValidation)
	}
	return nil
}

func (jobID OutboxJobID) IsValid() bool {
	return validUUID(string(jobID))
}

func (jobID OutboxJobID) Validate() error {
	if !jobID.IsValid() {
		return NewError(ErrorValidation)
	}
	return nil
}

func (leaseToken OutboxLeaseToken) IsValid() bool {
	return validUUID(string(leaseToken))
}

func (leaseToken OutboxLeaseToken) Validate() error {
	if !leaseToken.IsValid() {
		return NewError(ErrorValidation)
	}
	return nil
}

func (invitation Invitation) Status(now time.Time) InvitationStatus {
	if invitation.IsUsed() {
		return InvitationStatusUsed
	}

	if invitation.RevokedAt != nil {
		return InvitationStatusRevoked
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
