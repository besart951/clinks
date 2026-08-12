package domain

import (
	"strings"
	"time"
)

type TenantID string

type Tenant struct {
	ID        TenantID
	Name      string
	Revision  uint64
	CreatedAt time.Time
	UpdatedAt time.Time
}

type TenantOwnerRegistration struct {
	Email        Email
	PasswordHash PasswordHash
	Locale       Locale
	TenantName   string
}

func NewTenantID(value string) TenantID {
	return TenantID(
		strings.TrimSpace(value),
	)
}

func (tenantID TenantID) IsValid() bool {
	return validUUID(string(tenantID))
}

func (tenantID TenantID) Validate() error {
	if !tenantID.IsValid() {
		return NewError(ErrorValidation)
	}

	return nil
}
