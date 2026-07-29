package domain

type ErrorKind string

const (
	ErrorInvalidCredentials  ErrorKind = "invalid_credentials" // #nosec G101 -- This is a public error identifier, not a credential.
	ErrorUnauthorized        ErrorKind = "unauthorized"
	ErrorValidation          ErrorKind = "validation"
	ErrorEmailTaken          ErrorKind = "email_taken"
	ErrorTenantNotFound      ErrorKind = "tenant_not_found"
	ErrorMembershipNotFound  ErrorKind = "membership_not_found"
	ErrorInvitationInvalid   ErrorKind = "invitation_invalid"
	ErrorInvitationExpired   ErrorKind = "invitation_expired"
	ErrorInvitationUsed      ErrorKind = "invitation_used"
	ErrorInviteEmailMismatch ErrorKind = "invite_email_mismatch"
	ErrorInternal            ErrorKind = "internal"
)

type Error struct {
	Kind ErrorKind
}

func NewError(kind ErrorKind) *Error {
	return &Error{Kind: kind}
}

func (errorValue *Error) Error() string {
	return string(errorValue.Kind)
}
