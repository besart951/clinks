package clinks

import (
	"context"
)

type Users struct{ users UserStore }

func NewUsers(users UserStore) *Users {
	return &Users{users: users}
}

func (administration *Users) ListUsers(ctx context.Context, filter UserFilter) (Page[UserSummary], error) {
	filter, err := filter.Normalized()
	if err != nil {
		return Page[UserSummary]{}, err
	}
	return administration.users.ListUsers(ctx, filter)
}

func (administration *Users) GetUser(ctx context.Context, userID UserID) (UserDetail, error) {
	if !userID.IsValid() {
		return UserDetail{}, NewError(ErrorValidation)
	}
	return administration.users.GetUser(ctx, userID)
}
