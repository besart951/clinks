package domain

import "time"

type (
	MembershipID     string
	MembershipStatus string
)

const (
	MembershipActive   MembershipStatus = "active"
	MembershipInactive MembershipStatus = "inactive"
)

type Membership struct {
	ID        MembershipID
	UserID    UserID
	UserEmail Email
	Tenant    Tenant
	RoleID    RoleID
	Role      Role
	Status    MembershipStatus
	Revision  uint64
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (membershipID MembershipID) IsValid() bool {
	return validUUID(string(membershipID))
}

func (membershipID MembershipID) Validate() error {
	if !membershipID.IsValid() {
		return NewError(ErrorValidation)
	}
	return nil
}

func (status MembershipStatus) IsValid() bool {
	return status == MembershipActive || status == MembershipInactive
}
