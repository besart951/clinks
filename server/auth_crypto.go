package clinks

type PasswordHasher interface {
	Hash(password string) (PasswordHash, error)

	Verify(
		password string,
		hash PasswordHash,
	) bool
}

type SessionIssuer interface {
	Issue(
		claim SessionClaim,
	) (string, error)

	Verify(
		token string,
	) (SessionClaim, error)
}
