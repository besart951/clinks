package domain

type ErrorKind string

const (
	ErrorInvalidCredentials  ErrorKind = "invalid_credentials" // #nosec G101 -- Public error identifier, not a credential.
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
	return &Error{
		Kind: kind,
	}
}

func (err *Error) Error() string {
	if err == nil {
		return ""
	}

	return string(err.Kind)
}

func (err *Error) Is(target error) bool {
	other, ok := target.(*Error)

	return ok &&
		err != nil &&
		other != nil &&
		err.Kind == other.Kind
}

func (kind ErrorKind) IsValid() bool {
	switch kind {
	case ErrorInvalidCredentials,
		ErrorUnauthorized,
		ErrorValidation,
		ErrorEmailTaken,
		ErrorTenantNotFound,
		ErrorMembershipNotFound,
		ErrorInvitationInvalid,
		ErrorInvitationExpired,
		ErrorInvitationUsed,
		ErrorInviteEmailMismatch,
		ErrorInternal:
		return true

	default:
		return false
	}
}
