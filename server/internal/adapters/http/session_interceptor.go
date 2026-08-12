package http

import (
	"context"
	"sync"

	"connectrpc.com/connect"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type sessionContextKey struct{}

type sessionResolver func(ctx context.Context) (domain.Session, error)

// sessionInterceptor attaches a lazy session resolver to the request context.
// Session lookups in the store are deferred until requireSession is explicitly invoked,
// eliminating unnecessary I/O overhead on public endpoints.
func (server *Server) sessionInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, request connect.AnyRequest) (connect.AnyResponse, error) {
			token := server.cookieToken(request.Header())
			if token == "" {
				return next(ctx, request)
			}

			var (
				once    sync.Once
				session domain.Session
				err     error
			)

			resolver := func(ctx context.Context) (domain.Session, error) {
				once.Do(func() {
					session, err = server.sessions.CurrentSession(ctx, token)
				})
				return session, err
			}

			ctx = context.WithValue(ctx, sessionContextKey{}, sessionResolver(resolver))
			return next(ctx, request)
		}
	}
}

// sessionFromContext resolves and returns the session from context if a resolver exists.
func sessionFromContext(ctx context.Context) (domain.Session, error) {
	resolver, ok := ctx.Value(sessionContextKey{}).(sessionResolver)
	if !ok {
		return domain.Session{}, domain.NewError(domain.ErrorUnauthorized)
	}
	return resolver(ctx)
}

// requireSession extracts the authenticated session from context.
func requireSession(ctx context.Context) (domain.Session, error) {
	return sessionFromContext(ctx)
}

// requireSuperAdmin extracts the session from context and enforces the ROLE_SUPER_ADMIN check.
func requireSuperAdmin(ctx context.Context) (domain.User, error) {
	session, err := requireSession(ctx)
	if err != nil || !session.User.Role.IsSuperAdmin() {
		return domain.User{}, domain.NewError(domain.ErrorUnauthorized)
	}
	return session.User, nil
}
