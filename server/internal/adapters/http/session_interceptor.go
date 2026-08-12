package http

import (
	"context"
	"sync"

	"connectrpc.com/connect"

	"github.com/besartmorina/clinks/server/internal/core/domain"
)

type sessionContextKey struct{}

type sessionResolver func() (domain.Session, error)

// sessionInterceptor installs a lazy, memoized session resolver. Public RPCs
// therefore avoid session-store I/O unless a handler explicitly requires it.
func (server *Server) sessionInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, request connect.AnyRequest) (connect.AnyResponse, error) {
			token := server.cookieToken(request.Header())
			if token == "" {
				return next(ctx, request)
			}

			resolve := sync.OnceValues(func() (domain.Session, error) {
				return server.sessions.CurrentSession(ctx, token)
			})

			ctx = context.WithValue(ctx, sessionContextKey{}, sessionResolver(resolve))
			return next(ctx, request)
		}
	}
}

func requireSession(ctx context.Context) (domain.Session, error) {
	resolver, ok := ctx.Value(sessionContextKey{}).(sessionResolver)
	if !ok {
		return domain.Session{}, domain.NewError(domain.ErrorInvalidCredentials)
	}

	return resolver()
}

func requireSuperAdmin(ctx context.Context) (domain.User, error) {
	session, err := requireSession(ctx)
	if err != nil {
		return domain.User{}, err
	}
	if !session.User.Role.IsSuperAdmin() {
		return domain.User{}, domain.NewError(domain.ErrorUnauthorized)
	}

	return session.User, nil
}
