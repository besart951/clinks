package domain

import "strings"

type TenantID string

type Tenant struct {
	ID   TenantID
	Name string
}

type TenantOwnerRegistration struct {
	Email        Email
	PasswordHash PasswordHash
	Locale       Locale
	TenantName   string
}

type SuperAdminBootstrap struct {
	Email        Email
	PasswordHash PasswordHash
	Locale       Locale
}

func NewTenantID(id string) TenantID {
	return TenantID(id)
}

func (tenantID TenantID) IsValid() bool {
	return strings.TrimSpace(string(tenantID)) != ""
}

func (tenantID TenantID) Validate() error {
	if !tenantID.IsValid() {
		return NewError(ErrorValidation)
	}
	return nil
}
