// Package mocks provides in-memory implementations of domain ports for unit testing.
package mocks

import (
	"context"
	"sync"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
)

var _ ports.IdentityRepository = (*MemoryIdentityRepo)(nil)

type MemoryIdentityRepo struct {
	mu     sync.RWMutex
	users  map[domain.UserID]domain.User
	hashes map[domain.UserID]domain.PasswordHash
	emails map[domain.Email]domain.UserID
}

func NewMemoryIdentityRepo() *MemoryIdentityRepo {
	return &MemoryIdentityRepo{
		users:  make(map[domain.UserID]domain.User),
		hashes: make(map[domain.UserID]domain.PasswordHash),
		emails: make(map[domain.Email]domain.UserID),
	}
}

func (repo *MemoryIdentityRepo) EnsureSuperAdmin(ctx context.Context, admin domain.SuperAdminBootstrap) error {
	repo.mu.Lock()
	defer repo.mu.Unlock()

	userID := domain.UserID("user-superadmin")
	user := domain.User{
		ID:             userID,
		Email:          admin.Email,
		Role:           domain.RoleSuperAdmin,
		Locale:         admin.Locale,
		SessionVersion: 1,
	}
	repo.users[userID] = user
	repo.hashes[userID] = admin.PasswordHash
	repo.emails[admin.Email] = userID
	return nil
}

func (repo *MemoryIdentityRepo) FindByEmail(ctx context.Context, email domain.Email) (domain.User, domain.PasswordHash, error) {
	repo.mu.RLock()
	defer repo.mu.RUnlock()

	userID, exists := repo.emails[email]
	if !exists {
		return domain.User{}, "", domain.NewError(domain.ErrorInvalidCredentials)
	}
	return repo.users[userID], repo.hashes[userID], nil
}

func (repo *MemoryIdentityRepo) FindByID(ctx context.Context, id domain.UserID) (domain.User, error) {
	repo.mu.RLock()
	defer repo.mu.RUnlock()

	user, exists := repo.users[id]
	if !exists {
		return domain.User{}, domain.NewError(domain.ErrorUnauthorized)
	}
	return user, nil
}

func (repo *MemoryIdentityRepo) InvalidateSession(ctx context.Context, user domain.User) error {
	repo.mu.Lock()
	defer repo.mu.Unlock()

	existing, exists := repo.users[user.ID]
	if exists {
		existing.SessionVersion++
		repo.users[user.ID] = existing
	}
	return nil
}
