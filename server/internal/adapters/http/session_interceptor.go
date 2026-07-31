package http

import (
	"context"

	"connectrpc.com/connect"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type sessionContextKey struct{}

type sessionResult struct {
	session domain.Session
	err     error
}

// sessionInterceptor extracts the session cookie on every RPC and stores the
// result in context. Handlers that require authentication call requireSession;
// public endpoints may safely ignore it.
func (server *Server) sessionInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, request connect.AnyRequest) (connect.AnyResponse, error) {
			token := server.cookieToken(request.Header())
			if token == "" {
				ctx = context.WithValue(ctx, sessionContextKey{}, sessionResult{err: domain.NewError(domain.ErrorUnauthorized)})
			} else {
				session, err := server.sessions.CurrentSession(ctx, token)
				ctx = context.WithValue(ctx, sessionContextKey{}, sessionResult{session: session, err: err})
			}
			return next(ctx, request)
		}
	}
}

// sessionFromContext returns the (possibly invalid) session extracted by the
// interceptor. The caller is responsible for checking the error.
func sessionFromContext(ctx context.Context) (domain.Session, error) {
	result, ok := ctx.Value(sessionContextKey{}).(sessionResult)
	if !ok {
		return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
	}
	return result.session, result.err
}

// requireSession extracts the session from context and fails if the
// interceptor could not resolve a valid session.
func requireSession(ctx context.Context) (domain.Session, error) {
	session, err := sessionFromContext(ctx)
	if err != nil {
		return domain.Session{}, err
	}
	return session, nil
}

// requireSuperAdmin extracts the session from context and enforces the
// ROLE_SUPER_ADMIN check that was previously in server.superAdmin().
func requireSuperAdmin(ctx context.Context) (domain.User, error) {
	session, err := requireSession(ctx)
	if err != nil || !session.User.Role.IsSuperAdmin() {
		return domain.User{}, domain.NewError(domain.ErrorUnauthorized)
	}
	return session.User, nil
}
