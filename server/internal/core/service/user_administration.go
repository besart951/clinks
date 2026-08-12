package service

import (
	"context"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

type UserAdministration struct{ users ports.UserDirectory }

func NewUserAdministration(users ports.UserDirectory) *UserAdministration {
	return &UserAdministration{users: users}
}

func (administration *UserAdministration) ListUsers(ctx context.Context, filter domain.UserFilter) (domain.Page[domain.UserSummary], error) {
	filter, err := filter.Normalized()
	if err != nil {
		return domain.Page[domain.UserSummary]{}, err
	}
	return administration.users.ListUsers(ctx, filter)
}

func (administration *UserAdministration) GetUser(ctx context.Context, userID domain.UserID) (domain.UserDetail, error) {
	if !userID.IsValid() {
		return domain.UserDetail{}, domain.NewError(domain.ErrorValidation)
	}
	return administration.users.GetUser(ctx, userID)
}
