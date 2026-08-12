package auth

import (
	"fmt"

	"golang.org/x/crypto/bcrypt"

	clinks "github.com/besartmorina/clinks/server"
)

const (
	defaultPasswordHashCost = bcrypt.DefaultCost

	// rejectedPassword is used only to generate a valid dummy bcrypt
	// hash for authentication attempts where no real hash exists.
	rejectedPassword = "clinks-rejected-password"
)

type PasswordHasherConfig struct {
	Cost int
}

type PasswordHasher struct {
	cost         int
	rejectedHash clinks.PasswordHash
}

func NewPasswordHasher() (*PasswordHasher, error) {
	return NewPasswordHasherWithConfig(
		PasswordHasherConfig{
			Cost: defaultPasswordHashCost,
		},
	)
}

func NewPasswordHasherWithConfig(
	config PasswordHasherConfig,
) (*PasswordHasher, error) {
	cost := config.Cost

	if cost == 0 {
		cost = defaultPasswordHashCost
	}

	if cost < bcrypt.MinCost ||
		cost > bcrypt.MaxCost {
		return nil, fmt.Errorf(
			"password hasher: bcrypt cost must be between %d and %d",
			bcrypt.MinCost,
			bcrypt.MaxCost,
		)
	}

	rejectedHash, err := bcrypt.GenerateFromPassword(
		[]byte(rejectedPassword),
		cost,
	)
	if err != nil {
		return nil, fmt.Errorf(
			"password hasher: generate rejected password hash: %w",
			err,
		)
	}

	return &PasswordHasher{
		cost:         cost,
		rejectedHash: clinks.PasswordHash(rejectedHash),
	}, nil
}

func (hasher *PasswordHasher) Hash(
	password string,
) (clinks.PasswordHash, error) {
	if len(password) > 72 {
		return "",
			fmt.Errorf(
				"hash password: %w",
				bcrypt.ErrPasswordTooLong,
			)
	}

	hash, err := bcrypt.GenerateFromPassword(
		[]byte(password),
		hasher.cost,
	)
	if err != nil {
		return "",
			fmt.Errorf(
				"hash password: %w",
				err,
			)
	}

	return clinks.PasswordHash(hash), nil
}

func (hasher *PasswordHasher) Verify(
	password string,
	hash clinks.PasswordHash,
) bool {
	targetHash := hash

	if targetHash == "" {
		targetHash = hasher.rejectedHash
	}

	err := bcrypt.CompareHashAndPassword(
		[]byte(targetHash),
		[]byte(password),
	)

	return hash != "" && err == nil
}

func (hasher *PasswordHasher) NeedsRehash(hash clinks.PasswordHash) bool {
	if hash == "" {
		return false
	}

	cost, err := bcrypt.Cost(
		[]byte(hash),
	)
	if err != nil {
		return false
	}

	return cost != hasher.cost
}
