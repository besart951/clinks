// Package security provides cryptographic infrastructure adapters.
package security

import (
	"golang.org/x/crypto/bcrypt"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

// rejectedPasswordHash is a bcrypt hash at the default cost used for unknown users.
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
	if cost == 0 {
		cost = bcrypt.DefaultCost
	}
	return &PasswordHasher{cost: cost}
}

func (hasher *PasswordHasher) Hash(password string) (domain.PasswordHash, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), hasher.cost)
	if err != nil {
		return "", err
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
