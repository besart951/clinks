package domain

import (
	"strings"
	"time"
)

type (
	RoleID   string
	RoleKind string
)

const (
	RoleKindAdministrator RoleKind = "administrator"
	RoleKindUser          RoleKind = "user"
	RoleKindCustom        RoleKind = "custom"
)

type Role struct {
	ID          RoleID
	TenantID    TenantID
	Name        string
	Kind        RoleKind
	Permissions []Permission
	Revision    uint64
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func NewRoleID(value string) RoleID {
	return RoleID(strings.TrimSpace(value))
}

func (roleID RoleID) IsValid() bool {
	return validUUID(string(roleID))
}

func (roleID RoleID) Validate() error {
	if !roleID.IsValid() {
		return NewError(ErrorValidation)
	}
	return nil
}

func (role Role) IsValid() bool {
	return role.ID.IsValid() &&
		role.TenantID.IsValid() &&
		strings.TrimSpace(role.Name) != "" &&
		role.Kind.IsValid()
}

func (kind RoleKind) IsValid() bool {
	switch kind {
	case RoleKindAdministrator, RoleKindUser, RoleKindCustom:
		return true
	default:
		return false
	}
}

func (role Role) IsProtected() bool {
	return role.Kind == RoleKindAdministrator || role.Kind == RoleKindUser
}
