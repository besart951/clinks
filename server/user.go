package clinks

import (
	"strings"
	"time"
)

type (
	UserID     string
	GlobalRole string
)

const (
	GlobalRoleUser               GlobalRole = "user"
	GlobalRoleSuperAdministrator GlobalRole = "super_administrator"
)

func (role GlobalRole) IsValid() bool {
	return role == GlobalRoleUser || role == GlobalRoleSuperAdministrator
}

func (role GlobalRole) IsSuperAdministrator() bool {
	return role == GlobalRoleSuperAdministrator
}

type User struct {
	ID             UserID
	Email          Email
	GlobalRole     GlobalRole
	Locale         Locale
	SessionVersion int
}

type UserSummary struct {
	ID              UserID
	Email           Email
	Locale          Locale
	GlobalRole      GlobalRole
	MembershipCount int
	CreatedAt       time.Time
}

type UserDetail struct {
	User        User
	Memberships []Membership
}

type UserFilter struct {
	Search     string
	GlobalRole *GlobalRole
	Sort       UserSort
	Direction  SortDirection
	Cursor     Cursor
	Limit      int
}

type UserSort string

const (
	UserSortEmail     UserSort = "email"
	UserSortCreatedAt UserSort = "created_at"
)

func (filter UserFilter) Normalized() (UserFilter, error) {
	search, err := NormalizeSearch(filter.Search)
	if err != nil || !filter.Sort.IsValid() || !filter.Direction.IsValid() ||
		filter.GlobalRole != nil && !filter.GlobalRole.IsValid() {
		return UserFilter{}, NewError(ErrorValidation)
	}
	filter.Search = search
	filter.Limit = EffectiveLimit(filter.Limit)
	return filter, nil
}

func (sort UserSort) IsValid() bool {
	return sort == UserSortEmail || sort == UserSortCreatedAt
}

type SuperAdminBootstrap struct {
	Email        Email
	PasswordHash PasswordHash
	Locale       Locale
}

func NewUserID(value string) UserID {
	return UserID(strings.TrimSpace(value))
}

func (userID UserID) IsValid() bool {
	return validUUID(string(userID))
}

func (userID UserID) Validate() error {
	if !userID.IsValid() {
		return NewError(ErrorValidation)
	}
	return nil
}
