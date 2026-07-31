package http

import (
	"context"
	"errors"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
	"github.com/besartmorina/clinks/server/proto/clinks/v1/clinksv1connect"
)

type authenticationStub struct {
	session domain.Session
	err     error
}

func (stub *authenticationStub) Login(context.Context, string, string) (domain.Session, error) {
	return stub.session, stub.err
}

func (stub *authenticationStub) LoginSuperAdmin(context.Context, string, string) (domain.Session, error) {
	return stub.session, stub.err
}

func (stub *authenticationStub) Register(context.Context, string, string, string, domain.Locale) (domain.Session, error) {
	return stub.session, stub.err
}
func (stub *authenticationStub) Logout(context.Context, string) error { return stub.err }
func (stub *authenticationStub) CurrentSession(context.Context, string) (domain.Session, error) {
	return stub.session, stub.err
}

func (stub *authenticationStub) SwitchTenant(context.Context, string, domain.TenantID) (domain.Session, error) {
	return stub.session, stub.err
}

func (stub *authenticationStub) CreateInvitation(context.Context, string, string, domain.Role) (domain.Invitation, error) {
	return domain.Invitation{}, stub.err
}

func (stub *authenticationStub) AcceptInvitation(context.Context, string, string, string, domain.Locale) (domain.Session, error) {
	return stub.session, stub.err
}

type administrationStub struct{}

func (administrationStub) CreateTenant(context.Context, string, domain.UserID) (domain.Tenant, error) {
	return domain.Tenant{}, nil
}
func (administrationStub) Tenants(context.Context) ([]domain.Tenant, error)     { return nil, nil }
func (administrationStub) Languages(context.Context) ([]domain.Language, error) { return nil, nil }
func (administrationStub) SaveLanguage(context.Context, domain.Language, domain.UserID) error {
	return nil
}

func (administrationStub) SaveTranslationOverride(context.Context, domain.Translation, domain.UserID) error {
	return nil
}

func (administrationStub) AuditEvents(context.Context, *domain.AuditFilter) (domain.AuditPage, error) {
	return domain.AuditPage{}, nil
}

type localizationStub struct{}

func (localizationStub) ActiveLanguages(context.Context) ([]domain.Language, error) { return nil, nil }
func (localizationStub) TranslationBundle(context.Context, domain.Locale, domain.ApplicationScope) (domain.TranslationBundle, error) {
	return domain.TranslationBundle{}, nil
}

type translatorStub struct{}

func (translatorStub) ErrorMessage(context.Context, domain.Locale, error) string {
	return "Localized error"
}

func (translatorStub) AuditDescription(context.Context, domain.Locale, *domain.AuditEvent) string {
	return "Localized audit description"
}

type readinessStub struct{}

func (readinessStub) Ready(context.Context) error { return nil }

func TestLoginSetsHTTPOnlyLaxCookieWithoutExposingToken(t *testing.T) {
	sessionToken := strings.Repeat("x", 32)
	session := domain.Session{Token: sessionToken, User: domain.User{ID: "user-1", Email: "user@example.com", Locale: "de-CH"}}
	server := NewServer(ServerDeps{
		Sessions:         &authenticationStub{session: session},
		Registration:     &authenticationStub{session: session},
		Invitations:      &authenticationStub{session: session},
		Tenants:          administrationStub{},
		LocalizationEdit: administrationStub{},
		Audit:            administrationStub{},
		Localization:     localizationStub{},
		Translator:       translatorStub{},
		Readiness:        readinessStub{},
	}, &ServerConfig{Cookie: CookieConfig{MaxAge: time.Minute}})
	request := connect.NewRequest(&clinksv1.CredentialsRequest{Email: "user@example.com", Password: "password"})
	response, err := server.Login(context.Background(), request)
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	cookie := response.Header().Get("Set-Cookie")
	if cookie == "" || !containsAll(cookie, "HttpOnly", "SameSite=Lax") {
		t.Fatalf("Set-Cookie = %q", cookie)
	}
	if response.Msg.GetUser().GetEmail() != "user@example.com" {
		t.Fatalf("session user = %#v", response.Msg.GetUser())
	}
	if response.Msg.String() == sessionToken {
		t.Fatal("session token leaked in RPC response")
	}
}

func TestGetSessionReturnsLocalizedConnectError(t *testing.T) {
	srv := NewServer(ServerDeps{
		Sessions:         &authenticationStub{err: errors.New("expired")},
		Registration:     &authenticationStub{err: errors.New("expired")},
		Invitations:      &authenticationStub{err: errors.New("expired")},
		Tenants:          administrationStub{},
		LocalizationEdit: administrationStub{},
		Audit:            administrationStub{},
		Localization:     localizationStub{},
		Translator:       translatorStub{},
		Readiness:        readinessStub{},
	}, &ServerConfig{})
	testServer := httptest.NewServer(srv.Handler())
	defer testServer.Close()

	req := connect.NewRequest(&clinksv1.Empty{})
	req.Header().Set("Accept-Language", "de-CH")
	client := clinksv1connect.NewClinksServiceClient(testServer.Client(), testServer.URL)
	_, err := client.GetSession(context.Background(), req)
	connectError := new(connect.Error)
	if !errors.As(err, &connectError) || connectError.Message() != "Localized error" {
		t.Fatalf("GetSession() error = %v", err)
	}
	if connectError.Meta().Get("Clinks-Locale") != "de-CH" {
		t.Fatalf("locale metadata = %q", connectError.Meta().Get("Clinks-Locale"))
	}
}

func TestBrowserPolicyProtectsMutatingProcedures(t *testing.T) {
	policy := newBrowserPolicy([]string{"https://app.example/"})
	next := stdhttp.HandlerFunc(func(response stdhttp.ResponseWriter, _ *stdhttp.Request) {
		response.WriteHeader(stdhttp.StatusOK)
	})
	tests := []struct {
		name      string
		procedure string
		origin    string
		wantCode  int
		wantCORS  bool
	}{
		{
			name:      "rejects foreign origin for mutation",
			procedure: clinksv1connect.ClinksServiceLoginProcedure,
			origin:    "https://attacker.example",
			wantCode:  stdhttp.StatusForbidden,
		},
		{
			name:      "allows configured origin for mutation",
			procedure: clinksv1connect.ClinksServiceLoginProcedure,
			origin:    "https://app.example/",
			wantCode:  stdhttp.StatusOK,
			wantCORS:  true,
		},
		{
			name:      "allows foreign origin for read only procedure",
			procedure: clinksv1connect.ClinksServiceGetSessionProcedure,
			origin:    "https://attacker.example",
			wantCode:  stdhttp.StatusOK,
		},
		{
			name:      "treats unclassified procedure as mutation",
			procedure: "/clinks.v1.ClinksService/FutureProcedure",
			origin:    "https://attacker.example",
			wantCode:  stdhttp.StatusForbidden,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequestWithContext(context.Background(), stdhttp.MethodPost, test.procedure, stdhttp.NoBody)
			request.Header.Set("Origin", test.origin)
			response := httptest.NewRecorder()

			policy.protect(next).ServeHTTP(response, request)

			if response.Code != test.wantCode {
				t.Errorf("status = %d, want %d", response.Code, test.wantCode)
			}
			if gotCORS := response.Header().Get("Access-Control-Allow-Origin") != ""; gotCORS != test.wantCORS {
				t.Errorf("CORS header present = %t, want %t", gotCORS, test.wantCORS)
			}
		})
	}
}

func containsAll(value string, parts ...string) bool {
	for _, part := range parts {
		if !strings.Contains(value, part) {
			return false
		}
	}
	return true
}
