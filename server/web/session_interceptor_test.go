package web

import (
	"context"
	"errors"
	"testing"

	"connectrpc.com/connect"

	clinks "github.com/besartmorina/clinks/server"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
)

type sessionStub struct {
	currentCalls int
	logoutCalls  int
	session      clinks.Session
}

func (stub *sessionStub) CurrentSession(context.Context, string) (clinks.Session, error) {
	stub.currentCalls++
	return stub.session, nil
}

func (stub *sessionStub) Logout(_ context.Context, session clinks.Session) error {
	stub.logoutCalls++
	stub.session = session
	return nil
}

func (*sessionStub) SwitchTenant(context.Context, clinks.Session, clinks.TenantID) (clinks.Session, error) {
	return clinks.Session{}, nil
}

func TestLogoutResolvesSessionOnce(t *testing.T) {
	stub := &sessionStub{session: clinks.Session{
		Token: "token",
		User:  clinks.User{ID: "018f22d3-7ea5-7f09-b2ca-1dce3c584001"},
	}}
	server := &Server{
		auth:   authEndpoints{sessions: stub},
		cookie: CookieConfig{Name: "session"},
	}
	request := connect.NewRequest(&clinksv1.Empty{})
	request.Header().Set("Cookie", "session=token")

	handler := server.sessionInterceptor()(func(
		ctx context.Context,
		request connect.AnyRequest,
	) (connect.AnyResponse, error) {
		typedRequest, ok := request.(*connect.Request[clinksv1.Empty])
		if !ok {
			return nil, errors.New("unexpected request type")
		}
		return server.Logout(ctx, typedRequest)
	})

	if _, err := handler(t.Context(), request); err != nil {
		t.Fatalf("Logout() error = %v", err)
	}
	if stub.currentCalls != 1 {
		t.Fatalf("CurrentSession() calls = %d, want 1", stub.currentCalls)
	}
	if stub.logoutCalls != 1 {
		t.Fatalf("Logout() calls = %d, want 1", stub.logoutCalls)
	}
}
