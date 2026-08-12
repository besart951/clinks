// Package security provides cryptographic infrastructure adapters.
package security

import (
	"fmt"

	"golang.org/x/crypto/bcrypt"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

// rejectedPasswordHash is a dummy bcrypt hash used for missing users to mitigate timing attacks.
//
// #nosec G101 -- This is a public dummy hash, never a credential.
const rejectedPasswordHash = "$2a$10$7EqJtq98hPqEX7fNZaFWoOePP0bY3eV3ikPvN8YODjXpzYp9eR4Gi"

type PasswordHasher struct {
	cost int
}

func NewPasswordHasher() *PasswordHasher {
	return NewPasswordHasherWithCost(bcrypt.DefaultCost)
}

func NewPasswordHasherWithCost(cost int) *PasswordHasher {
	if cost < bcrypt.MinCost || cost > bcrypt.MaxCost {
		cost = bcrypt.DefaultCost
	}
	return &PasswordHasher{cost: cost}
}

func (hasher *PasswordHasher) Hash(password string) (domain.PasswordHash, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), hasher.cost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return domain.PasswordHash(hash), nil
}

func (hasher *PasswordHasher) Verify(password string, hash domain.PasswordHash) bool {
	targetHash := hash
	if targetHash == "" {
		targetHash = rejectedPasswordHash
	}
	matches := bcrypt.CompareHashAndPassword([]byte(targetHash), []byte(password)) == nil
	return hash != "" && matches
}
