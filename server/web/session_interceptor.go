package web

import (
	"context"
	"sync"

	"connectrpc.com/connect"

	clinks "github.com/besartmorina/clinks/server"
)

type sessionContextKey struct{}

type sessionResolver func() (clinks.Session, error)

// sessionInterceptor installs a lazy, memoized session resolver. Public RPCs
// therefore avoid session-store I/O unless a handler explicitly requires it.
func (server *Server) sessionInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, request connect.AnyRequest) (connect.AnyResponse, error) {
			token := server.cookieToken(request.Header())
			if token == "" {
				return next(ctx, request)
			}

			resolve := sync.OnceValues(func() (clinks.Session, error) {
				return server.auth.sessions.CurrentSession(ctx, token)
			})

			ctx = context.WithValue(ctx, sessionContextKey{}, sessionResolver(resolve))
			return next(ctx, request)
		}
	}
}

func requireSession(ctx context.Context) (clinks.Session, error) {
	resolver, ok := ctx.Value(sessionContextKey{}).(sessionResolver)
	if !ok {
		return clinks.Session{}, clinks.NewError(clinks.ErrorInvalidCredentials)
	}

	return resolver()
}

func requireSuperAdmin(ctx context.Context) (clinks.User, error) {
	session, err := requireSession(ctx)
	if err != nil {
		return clinks.User{}, err
	}
	if !session.User.GlobalRole.IsSuperAdministrator() {
		return clinks.User{}, clinks.NewError(clinks.ErrorUnauthorized)
	}

	return session.User, nil
}
