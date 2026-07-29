// Package http exposes Connect-RPC and the two plain HTTP health probes.
package http

import (
	"context"
	"errors"
	"log/slog"
	stdhttp "net/http"
	"strings"
	"time"

	"connectrpc.com/connect"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	"github.com/besartmorina/clinks/server/internal/core/ports"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
	"github.com/besartmorina/clinks/server/proto/clinks/v1/clinksv1connect"
)

const sessionCookieName = "clinks_session"

type Server struct {
	clinksv1connect.UnimplementedClinksServiceHandler
	sessions         sessionService
	registration     registrationService
	invitations      invitationService
	tenants          tenantAdministration
	localizationEdit localizationAdministration
	audit            auditLog
	localization     localizationService
	translator       errorTranslator
	readiness        ports.ReadinessChecker
	readinessTimeout time.Duration
	browserPolicy    browserPolicy
	cookie           CookieConfig
}

type sessionService interface {
	Login(context.Context, string, string) (domain.Session, error)
	LoginSuperAdmin(context.Context, string, string) (domain.Session, error)
	Logout(context.Context, string) error
	CurrentSession(context.Context, string) (domain.Session, error)
	SwitchTenant(context.Context, string, domain.TenantID) (domain.Session, error)
}

type registrationService interface {
	Register(context.Context, string, string, string, domain.Locale) (domain.Session, error)
}

type invitationService interface {
	CreateInvitation(context.Context, string, string, domain.Role) (domain.Invitation, error)
	AcceptInvitation(context.Context, string, string, string, domain.Locale) (domain.Session, error)
}

type tenantAdministration interface {
	CreateTenant(context.Context, string, domain.UserID) (domain.Tenant, error)
	Tenants(context.Context) ([]domain.Tenant, error)
}

type localizationAdministration interface {
	Languages(context.Context) ([]domain.Language, error)
	SaveLanguage(context.Context, domain.Language, domain.UserID) error
	SaveTranslationOverride(context.Context, domain.Translation, domain.UserID) error
}

type auditLog interface {
	AuditEvents(context.Context, *domain.AuditFilter) (domain.AuditPage, error)
}

type localizationService interface {
	ActiveLanguages(context.Context) ([]domain.Language, error)
	TranslationBundle(context.Context, domain.Locale, domain.ApplicationScope) (domain.TranslationBundle, error)
}

type errorTranslator interface {
	ErrorMessage(context.Context, domain.Locale, error) string
	AuditDescription(context.Context, domain.Locale, *domain.AuditEvent) string
}

type ServerConfig struct {
	CORSOrigins      []string
	ReadinessTimeout time.Duration
	Cookie           CookieConfig
}

type CookieConfig struct {
	Name   string
	Secure bool
	MaxAge time.Duration
	Domain string
}

func NewServer(sessions sessionService, registration registrationService, invitations invitationService, tenants tenantAdministration, localizationEdit localizationAdministration, audit auditLog, localization localizationService, translator errorTranslator, readiness ports.ReadinessChecker, config *ServerConfig) *Server {
	if config.Cookie.Name == "" {
		config.Cookie.Name = sessionCookieName
	}
	return &Server{sessions: sessions, registration: registration, invitations: invitations, tenants: tenants, localizationEdit: localizationEdit, audit: audit, localization: localization, translator: translator, readiness: readiness, readinessTimeout: config.ReadinessTimeout, browserPolicy: newBrowserPolicy(config.CORSOrigins), cookie: config.Cookie}
}

func (server *Server) Handler() stdhttp.Handler {
	router := stdhttp.NewServeMux()
	router.HandleFunc("GET /healthz", server.health)
	router.HandleFunc("GET /readyz", server.ready)
	path, rpcHandler := clinksv1connect.NewClinksServiceHandler(server)
	router.Handle(path, rpcHandler)
	return server.browserPolicy.protect(router)
}

func (server *Server) Login(ctx context.Context, request *connect.Request[clinksv1.CredentialsRequest]) (*connect.Response[clinksv1.Session], error) {
	session, err := server.sessions.Login(ctx, request.Msg.GetEmail(), request.Msg.GetPassword())
	return server.sessionResponse(ctx, request.Header(), &session, err)
}

func (server *Server) LoginSuperAdmin(ctx context.Context, request *connect.Request[clinksv1.CredentialsRequest]) (*connect.Response[clinksv1.Session], error) {
	session, err := server.sessions.LoginSuperAdmin(ctx, request.Msg.GetEmail(), request.Msg.GetPassword())
	return server.sessionResponse(ctx, request.Header(), &session, err)
}

func (server *Server) Register(ctx context.Context, request *connect.Request[clinksv1.RegisterRequest]) (*connect.Response[clinksv1.Session], error) {
	session, err := server.registration.Register(ctx, request.Msg.GetEmail(), request.Msg.GetPassword(), request.Msg.GetTenantName(), requestLocale(request.Header()))
	return server.sessionResponse(ctx, request.Header(), &session, err)
}

func (server *Server) Logout(ctx context.Context, request *connect.Request[clinksv1.Empty]) (*connect.Response[clinksv1.Empty], error) {
	if err := server.sessions.Logout(ctx, server.cookieToken(request.Header())); err != nil && !isSessionInvalid(err) {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	response := connect.NewResponse(&clinksv1.Empty{})
	response.Header().Add("Set-Cookie", server.sessionCookie("").String())
	return response, nil
}

func isSessionInvalid(err error) bool {
	var domainError *domain.Error
	return errors.As(err, &domainError) && (domainError.Kind == domain.ErrorUnauthorized || domainError.Kind == domain.ErrorInvalidCredentials)
}

func (server *Server) GetSession(ctx context.Context, request *connect.Request[clinksv1.Empty]) (*connect.Response[clinksv1.Session], error) {
	session, err := server.sessions.CurrentSession(ctx, server.cookieToken(request.Header()))
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(sessionMessage(&session)), nil
}

func (server *Server) SwitchTenant(ctx context.Context, request *connect.Request[clinksv1.SwitchTenantRequest]) (*connect.Response[clinksv1.Session], error) {
	session, err := server.sessions.SwitchTenant(ctx, server.cookieToken(request.Header()), domain.TenantID(request.Msg.GetTenantId()))
	return server.sessionResponse(ctx, request.Header(), &session, err)
}

func (server *Server) CreateInvitation(ctx context.Context, request *connect.Request[clinksv1.CreateInvitationRequest]) (*connect.Response[clinksv1.Invitation], error) {
	invitation, err := server.invitations.CreateInvitation(ctx, server.cookieToken(request.Header()), request.Msg.GetEmail(), domain.Role(request.Msg.GetRole()))
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(invitationMessage(&invitation)), nil
}

func (server *Server) AcceptInvitation(ctx context.Context, request *connect.Request[clinksv1.AcceptInvitationRequest]) (*connect.Response[clinksv1.Session], error) {
	session, err := server.invitations.AcceptInvitation(ctx, request.Msg.GetToken(), request.Msg.GetEmail(), request.Msg.GetPassword(), requestLocale(request.Header()))
	return server.sessionResponse(ctx, request.Header(), &session, err)
}

func (server *Server) GetLanguages(ctx context.Context, request *connect.Request[clinksv1.Empty]) (*connect.Response[clinksv1.LanguagesResponse], error) {
	languages, err := server.localization.ActiveLanguages(ctx)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(&clinksv1.LanguagesResponse{Languages: languageMessages(languages)}), nil
}

func (server *Server) GetTranslations(ctx context.Context, request *connect.Request[clinksv1.GetTranslationsRequest]) (*connect.Response[clinksv1.TranslationsResponse], error) {
	scope, err := domain.ParseApplicationScope(request.Msg.GetApplicationScope())
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	bundle, err := server.localization.TranslationBundle(ctx, requestLocale(request.Header()), scope)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(&clinksv1.TranslationsResponse{Locale: string(bundle.Locale), Translations: translationMessages(bundle.Translations)}), nil
}

func (server *Server) ListTenants(ctx context.Context, request *connect.Request[clinksv1.Empty]) (*connect.Response[clinksv1.TenantsResponse], error) {
	if _, err := server.superAdmin(ctx, request.Header()); err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	tenants, err := server.tenants.Tenants(ctx)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(&clinksv1.TenantsResponse{Tenants: tenantMessages(tenants)}), nil
}

func (server *Server) CreateTenant(ctx context.Context, request *connect.Request[clinksv1.CreateTenantRequest]) (*connect.Response[clinksv1.Tenant], error) {
	user, err := server.superAdmin(ctx, request.Header())
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	tenant, err := server.tenants.CreateTenant(ctx, request.Msg.GetName(), user.ID)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(tenantMessage(tenant)), nil
}

func (server *Server) ListManagedLanguages(ctx context.Context, request *connect.Request[clinksv1.Empty]) (*connect.Response[clinksv1.LanguagesResponse], error) {
	if _, err := server.superAdmin(ctx, request.Header()); err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	languages, err := server.localizationEdit.Languages(ctx)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(&clinksv1.LanguagesResponse{Languages: languageMessages(languages)}), nil
}

func (server *Server) SaveLanguage(ctx context.Context, request *connect.Request[clinksv1.Language]) (*connect.Response[clinksv1.Empty], error) {
	user, err := server.superAdmin(ctx, request.Header())
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	language := domain.Language{Code: domain.NewLocale(request.Msg.GetCode()), Name: request.Msg.GetName(), IsDefault: request.Msg.GetIsDefault(), IsActive: request.Msg.GetIsActive()}
	if err = server.localizationEdit.SaveLanguage(ctx, language, user.ID); err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(&clinksv1.Empty{}), nil
}

func (server *Server) SaveTranslation(ctx context.Context, request *connect.Request[clinksv1.ScopedTranslation]) (*connect.Response[clinksv1.Empty], error) {
	user, err := server.superAdmin(ctx, request.Header())
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	scope, err := domain.ParseApplicationScope(request.Msg.GetApplicationScope())
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	translation := domain.Translation{Locale: domain.NewLocale(request.Msg.GetLocale()), ApplicationScope: scope, Key: request.Msg.GetKey(), Value: request.Msg.GetValue()}
	if err = server.localizationEdit.SaveTranslationOverride(ctx, translation, user.ID); err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(&clinksv1.Empty{}), nil
}

func (server *Server) ListAuditEvents(ctx context.Context, request *connect.Request[clinksv1.ListAuditEventsRequest]) (*connect.Response[clinksv1.AuditEventsResponse], error) {
	if _, err := server.superAdmin(ctx, request.Header()); err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	filter, err := auditFilter(request.Msg)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	page, err := server.audit.AuditEvents(ctx, &filter)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(&clinksv1.AuditEventsResponse{Events: server.auditMessages(ctx, request.Header(), page.Events), NextCursor: page.NextCursor}), nil
}

func (server *Server) health(response stdhttp.ResponseWriter, _ *stdhttp.Request) {
	response.WriteHeader(stdhttp.StatusOK)
}

func (server *Server) ready(response stdhttp.ResponseWriter, request *stdhttp.Request) {
	ctx, cancel := context.WithTimeout(request.Context(), server.readinessTimeout)
	defer cancel()
	if err := server.readiness.Ready(ctx); err != nil {
		response.WriteHeader(stdhttp.StatusServiceUnavailable)
		return
	}
	response.WriteHeader(stdhttp.StatusOK)
}

func (server *Server) sessionResponse(ctx context.Context, header stdhttp.Header, session *domain.Session, err error) (*connect.Response[clinksv1.Session], error) {
	if err != nil {
		return nil, server.localizedError(ctx, header, err)
	}
	response := connect.NewResponse(sessionMessage(session))
	response.Header().Add("Set-Cookie", server.sessionCookie(session.Token).String())
	return response, nil
}

func (server *Server) superAdmin(ctx context.Context, header stdhttp.Header) (domain.User, error) {
	session, err := server.sessions.CurrentSession(ctx, server.cookieToken(header))
	if err != nil || !session.User.Role.IsSuperAdmin() {
		return domain.User{}, domain.NewError(domain.ErrorUnauthorized)
	}
	return session.User, nil
}

func (server *Server) localizedError(ctx context.Context, header stdhttp.Header, err error) error {
	code := connectCode(err)
	message := server.translator.ErrorMessage(ctx, requestLocale(header), err)
	if code == connect.CodeInternal {
		slog.Error("RPC request failed", "error", err)
	}
	response := connect.NewError(code, errors.New(message))
	response.Meta().Set("Clinks-Locale", string(requestLocale(header)))
	var domainErr *domain.Error
	if errors.As(err, &domainErr) {
		response.Meta().Set("Clinks-Error-Kind", string(domainErr.Kind))
	} else {
		response.Meta().Set("Clinks-Error-Kind", string(domain.ErrorInternal))
	}
	return response
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
	cookie := &stdhttp.Cookie{Name: server.cookie.Name, Value: token, Path: "/", Domain: server.cookie.Domain, HttpOnly: true, Secure: server.cookie.Secure, SameSite: stdhttp.SameSiteLaxMode} // #nosec G124 -- plaintext cookies require explicit local-development configuration.
	if token == "" {
		cookie.MaxAge = -1
		cookie.Expires = time.Unix(1, 0)
		return cookie
	}
	cookie.MaxAge = int(server.cookie.MaxAge.Seconds())
	return cookie
}

func requestLocale(header stdhttp.Header) domain.Locale {
	value := strings.Split(header.Get("Accept-Language"), ",")[0]
	value = strings.TrimSpace(strings.Split(value, ";")[0])
	if value == "" {
		return "en-US"
	}
	return domain.NewLocale(value)
}

func connectCode(err error) connect.Code {
	var domainError *domain.Error
	if !errors.As(err, &domainError) {
		return connect.CodeInternal
	}
	switch domainError.Kind {
	case domain.ErrorInvalidCredentials:
		return connect.CodeUnauthenticated
	case domain.ErrorUnauthorized, domain.ErrorMembershipNotFound:
		return connect.CodePermissionDenied
	case domain.ErrorValidation, domain.ErrorInviteEmailMismatch:
		return connect.CodeInvalidArgument
	case domain.ErrorEmailTaken:
		return connect.CodeAlreadyExists
	case domain.ErrorTenantNotFound, domain.ErrorInvitationInvalid:
		return connect.CodeNotFound
	case domain.ErrorInvitationExpired, domain.ErrorInvitationUsed:
		return connect.CodeFailedPrecondition
	default:
		return connect.CodeInternal
	}
}

func sessionMessage(session *domain.Session) *clinksv1.Session {
	return &clinksv1.Session{User: userMessage(session.User), ActiveTenant: tenantMessagePointer(session.ActiveTenant), Memberships: membershipMessages(session.Memberships)}
}

func userMessage(user domain.User) *clinksv1.User {
	return &clinksv1.User{Id: string(user.ID), Email: string(user.Email), Locale: string(user.Locale), IsSuperAdmin: user.Role.IsSuperAdmin()}
}

func tenantMessage(tenant domain.Tenant) *clinksv1.Tenant {
	return &clinksv1.Tenant{Id: string(tenant.ID), Name: tenant.Name}
}

func tenantMessagePointer(tenant *domain.Tenant) *clinksv1.Tenant {
	if tenant == nil {
		return nil
	}
	return tenantMessage(*tenant)
}

func tenantMessages(tenants []domain.Tenant) []*clinksv1.Tenant {
	messages := make([]*clinksv1.Tenant, 0, len(tenants))
	for _, tenant := range tenants {
		messages = append(messages, tenantMessage(tenant))
	}
	return messages
}

func membershipMessages(memberships []domain.Membership) []*clinksv1.Membership {
	messages := make([]*clinksv1.Membership, 0, len(memberships))
	for _, membership := range memberships {
		messages = append(messages, &clinksv1.Membership{Id: string(membership.ID), Tenant: tenantMessage(membership.Tenant), Role: string(membership.Role), Status: string(membership.Status)})
	}
	return messages
}

func invitationMessage(invitation *domain.Invitation) *clinksv1.Invitation {
	return &clinksv1.Invitation{Id: string(invitation.ID), TenantId: string(invitation.TenantID), Email: string(invitation.Email), Role: string(invitation.Role), ExpiresAt: invitation.ExpiresAt.UTC().Format(time.RFC3339), AcceptanceUrl: invitation.Acceptance, DeliveryStatus: invitation.DeliveryStatus}
}

func languageMessages(languages []domain.Language) []*clinksv1.Language {
	messages := make([]*clinksv1.Language, 0, len(languages))
	for _, language := range languages {
		messages = append(messages, &clinksv1.Language{Code: string(language.Code), Name: language.Name, IsDefault: language.IsDefault, IsActive: language.IsActive})
	}
	return messages
}

func translationMessages(translations []domain.Translation) []*clinksv1.ScopedTranslation {
	messages := make([]*clinksv1.ScopedTranslation, 0, len(translations))
	for _, translation := range translations {
		messages = append(messages, &clinksv1.ScopedTranslation{Locale: string(translation.Locale), ApplicationScope: string(translation.ApplicationScope), Key: translation.Key, Value: translation.Value})
	}
	return messages
}

func auditFilter(request *clinksv1.ListAuditEventsRequest) (domain.AuditFilter, error) {
	filter := domain.AuditFilter{Action: request.GetAction(), Cursor: request.GetCursor(), PageSize: int(request.GetPageSize())}
	var err error
	if filter.From, err = parseOptionalTime(request.GetFrom()); err != nil {
		return domain.AuditFilter{}, err
	}
	if filter.To, err = parseOptionalTime(request.GetTo()); err != nil {
		return domain.AuditFilter{}, err
	}
	if request.GetActorId() != "" {
		filter.ActorID = new(domain.UserID(request.GetActorId()))
	}
	if request.GetTenantId() != "" {
		filter.TenantID = new(domain.TenantID(request.GetTenantId()))
	}
	return filter, nil
}

func parseOptionalTime(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, nil
	}
	return time.Parse(time.RFC3339, value)
}

func (server *Server) auditMessages(ctx context.Context, header stdhttp.Header, events []domain.AuditEvent) []*clinksv1.AuditEvent {
	messages := make([]*clinksv1.AuditEvent, 0, len(events))
	for index := range events {
		event := &events[index]
		message := &clinksv1.AuditEvent{Id: string(event.ID), OccurredAt: event.OccurredAt.UTC().Format(time.RFC3339), ActorEmail: event.ActorEmail, TenantName: event.TenantName, Action: event.Action, Target: event.Target, Description: server.translator.AuditDescription(ctx, requestLocale(header), event)}
		if event.ActorID != nil {
			message.ActorId = string(*event.ActorID)
		}
		if event.TenantID != nil {
			message.TenantId = string(*event.TenantID)
		}
		messages = append(messages, message)
	}
	return messages
}

var _ clinksv1connect.ClinksServiceHandler = (*Server)(nil)
