package domain

import "strings"

type UserID string

type User struct {
	ID             UserID
	Email          Email
	IsSuperAdmin   bool
	Locale         Locale
	SessionVersion int
}

type UserSummary struct {
	ID              UserID
	Email           Email
	Locale          Locale
	IsSuperAdmin    bool
	MembershipCount int
}

type UserDetail struct {
	User        User
	Memberships []Membership
}

type UserFilter struct {
	Search string
	Cursor Cursor
	Limit  int
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
	return userID != ""
}
