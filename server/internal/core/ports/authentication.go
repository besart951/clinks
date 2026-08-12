package ports

import "github.com/besartmorina/clinks/server/internal/core/domain"

type PasswordHasher interface {
	Hash(password string) (domain.PasswordHash, error)

	Verify(
		password string,
		hash domain.PasswordHash,
	) bool
}

type SessionIssuer interface {
	Issue(
		claim domain.SessionClaim,
	) (string, error)

	Verify(
		token string,
	) (domain.SessionClaim, error)
}
