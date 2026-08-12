package web

import (
	"net/http"
	"testing"

	"connectrpc.com/connect"

	clinks "github.com/besartmorina/clinks/server"
)

func TestConnectCode(t *testing.T) {
	tests := []struct {
		kind clinks.ErrorKind
		want connect.Code
	}{
		{clinks.ErrorInvalidCredentials, connect.CodeUnauthenticated},
		{clinks.ErrorUnauthorized, connect.CodePermissionDenied},
		{clinks.ErrorValidation, connect.CodeInvalidArgument},
		{clinks.ErrorEmailTaken, connect.CodeAlreadyExists},
		{clinks.ErrorTenantNotFound, connect.CodeNotFound},
		{clinks.ErrorInvitationExpired, connect.CodeFailedPrecondition},
		{clinks.ErrorConflict, connect.CodeAborted},
		{clinks.ErrorRateLimited, connect.CodeResourceExhausted},
		{clinks.ErrorInternal, connect.CodeInternal},
	}

	for _, test := range tests {
		t.Run(string(test.kind), func(t *testing.T) {
			if got := connectCode(clinks.NewError(test.kind)); got != test.want {
				t.Fatalf("connectCode() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestSessionCookieIsBrowserOnly(t *testing.T) {
	server := &Server{cookie: CookieConfig{Name: "session", Secure: true}}
	cookie := server.sessionCookie("token")

	if !cookie.HttpOnly || !cookie.Secure {
		t.Fatalf("cookie security flags = HttpOnly:%t Secure:%t", cookie.HttpOnly, cookie.Secure)
	}
	if cookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("SameSite = %v, want Lax", cookie.SameSite)
	}
}
