package domain

import (
	"strings"
	"time"
)

type RoleID string

type Role struct {
	ID        RoleID
	TenantID  TenantID
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

func NewRoleID(value string) RoleID {
	return RoleID(strings.TrimSpace(value))
}

func (roleID RoleID) IsValid() bool {
	return roleID != ""
}

func (role Role) IsValid() bool {
	return role.ID.IsValid() &&
		role.TenantID.IsValid() &&
		strings.TrimSpace(role.Name) != ""
}
