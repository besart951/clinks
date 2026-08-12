package web

import (
	"context"
	"errors"
	stdhttp "net/http"
	"strconv"
	"strings"
	"time"

	"connectrpc.com/connect"

	clinks "github.com/besartmorina/clinks/server"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
)

const transportErrorRateLimited = "rate_limited"

func (server *Server) sessionResponse(
	ctx context.Context,
	header stdhttp.Header,
	session clinks.Session,
	err error,
) (*connect.Response[clinksv1.Session], error) {
	if err != nil {
		return nil, server.localizedError(ctx, header, err)
	}

	response := connect.NewResponse(sessionMessage(&session))
	response.Header().Add("Set-Cookie", server.sessionCookie(session.Token).String())
	return response, nil
}

func (server *Server) localizedError(ctx context.Context, header stdhttp.Header, err error) error {
	code := connectCode(err)
	locale := server.requestLocale(header)
	message := server.localization.translator.ErrorMessage(ctx, locale, err)

	if code == connect.CodeInternal {
		server.logger.ErrorContext(ctx, "RPC request failed", "error", err)
	}

	response := connect.NewError(code, errors.New(message))
	response.Meta().Set("Clinks-Locale", string(locale))

	if domainError, ok := errors.AsType[*clinks.Error](err); ok {
		response.Meta().Set("Clinks-Error-Kind", string(domainError.Kind))
	} else {
		response.Meta().Set("Clinks-Error-Kind", string(clinks.ErrorInternal))
	}

	return response
}

func (server *Server) rateLimitError(
	ctx context.Context,
	header stdhttp.Header,
	retryAfter time.Duration,
) error {
	locale := server.requestLocale(header)
	message := server.localization.translator.ErrorMessage(
		ctx,
		locale,
		clinks.NewError(clinks.ErrorRateLimited),
	)
	response := connect.NewError(
		connect.CodeResourceExhausted,
		errors.New(message),
	)
	response.Meta().Set("Clinks-Error-Kind", transportErrorRateLimited)
	response.Meta().Set("Clinks-Locale", string(locale))
	if retryAfter > 0 {
		seconds := int64((retryAfter + time.Second - 1) / time.Second)
		response.Meta().Set("Retry-After", strconv.FormatInt(seconds, 10))
	}
	return response
}

func connectCode(err error) connect.Code {
	domainError, ok := errors.AsType[*clinks.Error](err)
	if !ok {
		return connect.CodeInternal
	}

	switch domainError.Kind {
	case clinks.ErrorInvalidCredentials:
		return connect.CodeUnauthenticated
	case clinks.ErrorUnauthorized, clinks.ErrorMembershipNotFound:
		return connect.CodePermissionDenied
	case clinks.ErrorValidation, clinks.ErrorInviteEmailMismatch:
		return connect.CodeInvalidArgument
	case clinks.ErrorEmailTaken:
		return connect.CodeAlreadyExists
	case clinks.ErrorTenantNotFound, clinks.ErrorInvitationInvalid,
		clinks.ErrorRoleNotFound, clinks.ErrorUserNotFound:
		return connect.CodeNotFound
	case clinks.ErrorInvitationExpired, clinks.ErrorInvitationUsed:
		return connect.CodeFailedPrecondition
	case clinks.ErrorConflict:
		return connect.CodeAborted
	case clinks.ErrorRateLimited:
		return connect.CodeResourceExhausted
	default:
		return connect.CodeInternal
	}
}

func (server *Server) cookieToken(header stdhttp.Header) string {
	request := stdhttp.Request{Header: header}
	cookie, err := request.Cookie(server.cookie.Name)
	if err != nil {
		return ""
	}

	return cookie.Value
}

func (server *Server) sessionCookie(token string) *stdhttp.Cookie {
	//nolint:gosec // Secure may be disabled only by explicit local-development configuration.
	cookie := &stdhttp.Cookie{
		Name:     server.cookie.Name,
		Value:    token,
		Path:     "/",
		Domain:   server.cookie.Domain,
		HttpOnly: true,
		Secure:   server.cookie.Secure,
		SameSite: stdhttp.SameSiteLaxMode,
	}

	if token == "" {
		cookie.MaxAge = -1
		cookie.Expires = time.Unix(1, 0)
		return cookie
	}

	if server.cookie.MaxAge > 0 {
		cookie.MaxAge = int(server.cookie.MaxAge.Seconds())
		cookie.Expires = time.Now().Add(server.cookie.MaxAge)
	}

	return cookie
}

func (server *Server) requestLocale(header stdhttp.Header) clinks.Locale {
	rawHeader := header.Get("Accept-Language")
	if rawHeader == "" {
		return server.defaultLocale
	}

	primaryTag := strings.Split(rawHeader, ",")[0]
	cleanTag := strings.TrimSpace(strings.Split(primaryTag, ";")[0])
	if cleanTag == "" {
		return server.defaultLocale
	}

	locale, err := clinks.ParseLocale(cleanTag)
	if err != nil {
		return server.defaultLocale
	}
	return locale
}
