package http

import (
	"context"
	stdhttp "net/http"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
)

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

func userSummaryMessages(summaries []domain.UserSummary) []*clinksv1.UserSummary {
	messages := make([]*clinksv1.UserSummary, 0, len(summaries))
	for _, summary := range summaries {
		messages = append(messages, &clinksv1.UserSummary{
			Id: string(summary.ID), Email: string(summary.Email),
			Locale: string(summary.Locale), IsSuperAdmin: summary.IsSuperAdmin,
			MembershipCount: uint32(summary.MembershipCount), //nolint:gosec // count fits in uint32
		})
	}
	return messages
}

func userDetailMessage(detail *domain.UserDetail) *clinksv1.UserDetail {
	return &clinksv1.UserDetail{
		User: &clinksv1.UserSummary{
			Id: string(detail.User.ID), Email: string(detail.User.Email),
			Locale:       string(detail.User.Locale),
			IsSuperAdmin: detail.User.Role.IsSuperAdmin(),
		},
		Memberships: membershipMessages(detail.Memberships),
	}
}
