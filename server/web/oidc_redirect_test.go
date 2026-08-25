package web

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"

	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
)

const testOIDCStateSecret = "0123456789abcdef0123456789abcdef"

func TestOIDCSuccessURLAllowsOnlyTrustedApplicationOrigins(t *testing.T) {
	t.Parallel()

	policy, err := newBrowserPolicy([]string{
		"https://planer.clinks.test",
		"https://infra.clinks.test",
	})
	if err != nil {
		t.Fatalf("newBrowserPolicy() error = %v", err)
	}
	server := &Server{browserPolicy: policy}

	got, err := server.oidcSuccessURL(
		"https://infra.clinks.test/invite?token=opaque&completed=1",
		"https://planer.clinks.test/dashboard",
	)
	if err != nil {
		t.Fatalf("oidcSuccessURL() error = %v", err)
	}
	if want := "https://infra.clinks.test/invite?token=opaque&completed=1"; got != want {
		t.Fatalf("oidcSuccessURL() = %q, want %q", got, want)
	}

	if _, err := server.oidcSuccessURL(
		"https://attacker.test/collect",
		"https://planer.clinks.test/dashboard",
	); err == nil {
		t.Fatal("oidcSuccessURL() accepted an untrusted redirect origin")
	}
}

func TestOIDCAttemptRequiresSuccessURL(t *testing.T) {
	t.Parallel()

	attempt := oidcAttempt{
		State:      "state",
		Nonce:      "nonce",
		Verifier:   "verifier",
		Mode:       "login",
		ExpiresAt:  time.Now().Add(time.Minute).Unix(),
		SuccessURL: "https://planer.clinks.test/dashboard",
	}
	if !validOIDCAttempt(attempt, time.Now()) {
		t.Fatal("validOIDCAttempt() rejected a complete attempt")
	}
	attempt.SuccessURL = ""
	if validOIDCAttempt(attempt, time.Now()) {
		t.Fatal("validOIDCAttempt() accepted an attempt without a success URL")
	}
}

func TestOIDCProviderErrorReturnsToOriginatingApplication(t *testing.T) {
	t.Parallel()

	policy, err := newBrowserPolicy([]string{
		"https://planer.clinks.test",
		"https://infra.clinks.test",
	})
	if err != nil {
		t.Fatalf("newBrowserPolicy() error = %v", err)
	}
	server := &Server{browserPolicy: policy}
	attempt, err := newOIDCAttempt("login", "https://infra.clinks.test/login?completed=1")
	if err != nil {
		t.Fatalf("newOIDCAttempt() error = %v", err)
	}
	sealed, err := sealOIDCAttempt(testOIDCStateSecret, attempt)
	if err != nil {
		t.Fatalf("sealOIDCAttempt() error = %v", err)
	}

	request := httptest.NewRequestWithContext(
		t.Context(),
		"GET",
		"https://api.clinks.test/auth/oidc/google/callback?error=access_denied&state="+attempt.State,
		http.NoBody,
	)
	request.AddCookie(server.oidcAttemptCookie(sealed))
	response := httptest.NewRecorder()
	server.googleOIDCCallback(nil, OIDCConfig{
		StateSecret: testOIDCStateSecret,
		SuccessURL:  "https://planer.clinks.test/login",
	})(response, request)

	if response.Code != 302 {
		t.Fatalf("callback status = %d, want 302", response.Code)
	}
	if want := "https://infra.clinks.test/login?completed=1&error=authentication_failed"; response.Header().Get("Location") != want {
		t.Fatalf("callback Location = %q, want %q", response.Header().Get("Location"), want)
	}
}

func TestGetAuthCapabilitiesReflectsConfiguredHandler(t *testing.T) {
	t.Parallel()

	server := &Server{auth: authEndpoints{googleOIDCEnabled: true}}
	response, err := server.GetAuthCapabilities(t.Context(), connect.NewRequest(&clinksv1.Empty{}))
	if err != nil {
		t.Fatalf("GetAuthCapabilities() error = %v", err)
	}
	if !response.Msg.GetGoogleOidcEnabled() {
		t.Fatal("GetAuthCapabilities() google_oidc_enabled = false, want true")
	}
}
