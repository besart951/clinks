package http

import (
	"context"
	stdhttp "net/http"
	"time"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
)

func sessionMessage(session *domain.Session) *clinksv1.Session {
	if session == nil {
		return nil
	}
	return &clinksv1.Session{
		User:         userMessage(session.User),
		ActiveTenant: tenantMessagePointer(session.ActiveTenant),
		Memberships:  membershipMessages(session.Memberships),
	}
}

func sortDirection(value clinksv1.SortDirection, defaultDirection domain.SortDirection) (domain.SortDirection, bool) {
	switch value {
	case clinksv1.SortDirection_SORT_DIRECTION_UNSPECIFIED:
		return defaultDirection, true
	case clinksv1.SortDirection_SORT_DIRECTION_ASCENDING:
		return domain.SortAscending, true
	case clinksv1.SortDirection_SORT_DIRECTION_DESCENDING:
		return domain.SortDescending, true
	default:
		return "", false
	}
}

func tenantSort(value clinksv1.TenantSort) (domain.TenantSort, bool) {
	switch value {
	case clinksv1.TenantSort_TENANT_SORT_UNSPECIFIED, clinksv1.TenantSort_TENANT_SORT_NAME:
		return domain.TenantSortName, true
	case clinksv1.TenantSort_TENANT_SORT_CREATED_AT:
		return domain.TenantSortCreatedAt, true
	default:
		return "", false
	}
}

func userSort(value clinksv1.UserSort) (domain.UserSort, bool) {
	switch value {
	case clinksv1.UserSort_USER_SORT_UNSPECIFIED, clinksv1.UserSort_USER_SORT_EMAIL:
		return domain.UserSortEmail, true
	case clinksv1.UserSort_USER_SORT_CREATED_AT:
		return domain.UserSortCreatedAt, true
	default:
		return "", false
	}
}

func invitationSort(value clinksv1.InvitationSort) (domain.InvitationSort, bool) {
	switch value {
	case clinksv1.InvitationSort_INVITATION_SORT_UNSPECIFIED, clinksv1.InvitationSort_INVITATION_SORT_CREATED_AT:
		return domain.InvitationSortCreatedAt, true
	case clinksv1.InvitationSort_INVITATION_SORT_EMAIL:
		return domain.InvitationSortEmail, true
	case clinksv1.InvitationSort_INVITATION_SORT_EXPIRES_AT:
		return domain.InvitationSortExpiresAt, true
	default:
		return "", false
	}
}

func membershipSort(value clinksv1.MembershipSort) (domain.MembershipSort, bool) {
	switch value {
	case clinksv1.MembershipSort_MEMBERSHIP_SORT_UNSPECIFIED, clinksv1.MembershipSort_MEMBERSHIP_SORT_EMAIL:
		return domain.MembershipSortEmail, true
	case clinksv1.MembershipSort_MEMBERSHIP_SORT_CREATED_AT:
		return domain.MembershipSortCreatedAt, true
	default:
		return "", false
	}
}

func roleSort(value clinksv1.RoleSort) (domain.RoleSort, bool) {
	switch value {
	case clinksv1.RoleSort_ROLE_SORT_UNSPECIFIED, clinksv1.RoleSort_ROLE_SORT_NAME:
		return domain.RoleSortName, true
	case clinksv1.RoleSort_ROLE_SORT_CREATED_AT:
		return domain.RoleSortCreatedAt, true
	default:
		return "", false
	}
}

func languageSort(value clinksv1.LanguageSort) (domain.LanguageSort, bool) {
	switch value {
	case clinksv1.LanguageSort_LANGUAGE_SORT_UNSPECIFIED, clinksv1.LanguageSort_LANGUAGE_SORT_NAME:
		return domain.LanguageSortName, true
	case clinksv1.LanguageSort_LANGUAGE_SORT_CODE:
		return domain.LanguageSortCode, true
	default:
		return "", false
	}
}

func translationSort(value clinksv1.TranslationSort) (domain.TranslationSort, bool) {
	switch value {
	case clinksv1.TranslationSort_TRANSLATION_SORT_UNSPECIFIED, clinksv1.TranslationSort_TRANSLATION_SORT_KEY:
		return domain.TranslationSortKey, true
	case clinksv1.TranslationSort_TRANSLATION_SORT_UPDATED_AT:
		return domain.TranslationSortUpdatedAt, true
	default:
		return "", false
	}
}

func userMessage(user domain.User) *clinksv1.User {
	return &clinksv1.User{
		Id:         string(user.ID),
		Email:      string(user.Email),
		Locale:     string(user.Locale),
		GlobalRole: globalRoleMessage(user.GlobalRole),
	}
}

func userSummaryMessages(summaries []domain.UserSummary) []*clinksv1.UserSummary {
	messages := make([]*clinksv1.UserSummary, len(summaries))
	for i, summary := range summaries {
		messages[i] = &clinksv1.UserSummary{
			Id:              string(summary.ID),
			Email:           string(summary.Email),
			Locale:          string(summary.Locale),
			GlobalRole:      globalRoleMessage(summary.GlobalRole),
			MembershipCount: uint32(summary.MembershipCount), //nolint:gosec // count fits in uint32
		}
	}
	return messages
}

func userDetailMessage(detail domain.UserDetail) *clinksv1.UserDetail {
	return &clinksv1.UserDetail{
		User: &clinksv1.UserSummary{
			Id:         string(detail.User.ID),
			Email:      string(detail.User.Email),
			Locale:     string(detail.User.Locale),
			GlobalRole: globalRoleMessage(detail.User.GlobalRole),
		},
		Memberships: membershipMessages(detail.Memberships),
	}
}

func tenantMessage(tenant domain.Tenant) *clinksv1.Tenant {
	return &clinksv1.Tenant{
		Id:       string(tenant.ID),
		Name:     tenant.Name,
		Revision: tenant.Revision,
	}
}

func tenantMessagePointer(tenant *domain.Tenant) *clinksv1.Tenant {
	if tenant == nil {
		return nil
	}
	return tenantMessage(*tenant)
}

func tenantMessages(tenants []domain.Tenant) []*clinksv1.Tenant {
	messages := make([]*clinksv1.Tenant, len(tenants))
	for i, tenant := range tenants {
		messages[i] = tenantMessage(tenant)
	}
	return messages
}

func membershipMessages(memberships []domain.Membership) []*clinksv1.Membership {
	messages := make([]*clinksv1.Membership, len(memberships))
	for i, membership := range memberships {
		messages[i] = &clinksv1.Membership{
			Id:        string(membership.ID),
			UserId:    string(membership.UserID),
			UserEmail: string(membership.UserEmail),
			Tenant:    tenantMessage(membership.Tenant),
			Role:      roleSummaryMessage(membership.Role),
			Status:    membershipStatusMessage(membership.Status),
			Revision:  membership.Revision,
		}
	}
	return messages
}

func invitationMessage(invitation domain.Invitation) *clinksv1.Invitation {
	message := &clinksv1.Invitation{
		Id:             string(invitation.ID),
		TenantId:       string(invitation.TenantID),
		Email:          string(invitation.Email),
		Role:           roleSummaryMessage(invitation.Role),
		Status:         invitationStatusMessage(invitation),
		ExpiresAt:      invitation.ExpiresAt.UTC().Format(time.RFC3339),
		AcceptanceUrl:  invitation.Acceptance,
		DeliveryStatus: string(invitation.DeliveryStatus),
	}
	if message.Role.Id == "" {
		message.Role.Id = string(invitation.RoleID)
	}
	if invitation.UsedAt != nil {
		message.UsedAt = invitation.UsedAt.UTC().Format(time.RFC3339)
	}
	if invitation.RevokedAt != nil {
		message.RevokedAt = invitation.RevokedAt.UTC().Format(time.RFC3339)
	}
	return message
}

func languageMessages(languages []domain.Language) []*clinksv1.Language {
	messages := make([]*clinksv1.Language, len(languages))
	for i, language := range languages {
		messages[i] = &clinksv1.Language{
			Code:      string(language.Code),
			Name:      language.Name,
			IsDefault: language.IsDefault,
			IsActive:  language.IsActive,
			Revision:  language.Revision,
		}
	}
	return messages
}

func globalRoleMessage(role domain.GlobalRole) clinksv1.GlobalRole {
	if role.IsSuperAdministrator() {
		return clinksv1.GlobalRole_GLOBAL_ROLE_SUPER_ADMINISTRATOR
	}
	return clinksv1.GlobalRole_GLOBAL_ROLE_USER
}

func roleKindMessage(kind domain.RoleKind) clinksv1.RoleKind {
	switch kind {
	case domain.RoleKindAdministrator:
		return clinksv1.RoleKind_ROLE_KIND_ADMINISTRATOR
	case domain.RoleKindUser:
		return clinksv1.RoleKind_ROLE_KIND_USER
	case domain.RoleKindCustom:
		return clinksv1.RoleKind_ROLE_KIND_CUSTOM
	default:
		return clinksv1.RoleKind_ROLE_KIND_UNSPECIFIED
	}
}

func roleSummaryMessage(role domain.Role) *clinksv1.RoleSummary {
	permissions := make([]string, len(role.Permissions))
	for index, permission := range role.Permissions {
		permissions[index] = string(permission)
	}
	return &clinksv1.RoleSummary{
		Id:          string(role.ID),
		Name:        role.Name,
		Kind:        roleKindMessage(role.Kind),
		Permissions: permissions,
		Revision:    role.Revision,
	}
}

func membershipStatusMessage(status domain.MembershipStatus) clinksv1.MembershipStatus {
	if status == domain.MembershipActive {
		return clinksv1.MembershipStatus_MEMBERSHIP_STATUS_ACTIVE
	}
	if status == domain.MembershipInactive {
		return clinksv1.MembershipStatus_MEMBERSHIP_STATUS_INACTIVE
	}
	return clinksv1.MembershipStatus_MEMBERSHIP_STATUS_UNSPECIFIED
}

func invitationStatusMessage(invitation domain.Invitation) clinksv1.InvitationStatus {
	switch invitation.Status(time.Now()) {
	case domain.InvitationStatusPending:
		return clinksv1.InvitationStatus_INVITATION_STATUS_PENDING
	case domain.InvitationStatusUsed:
		return clinksv1.InvitationStatus_INVITATION_STATUS_USED
	case domain.InvitationStatusExpired:
		return clinksv1.InvitationStatus_INVITATION_STATUS_EXPIRED
	case domain.InvitationStatusRevoked:
		return clinksv1.InvitationStatus_INVITATION_STATUS_REVOKED
	default:
		return clinksv1.InvitationStatus_INVITATION_STATUS_UNSPECIFIED
	}
}

func translationMessages(translations []domain.Translation) []*clinksv1.ScopedTranslation {
	messages := make([]*clinksv1.ScopedTranslation, len(translations))
	for i, translation := range translations {
		messages[i] = &clinksv1.ScopedTranslation{
			Locale:           string(translation.Locale),
			ApplicationScope: string(translation.ApplicationScope),
			Key:              translation.Key,
			Value:            translation.Value,
		}
	}
	return messages
}

func translationOverrideMessage(translation domain.Translation) *clinksv1.TranslationOverride {
	return &clinksv1.TranslationOverride{
		Locale:           string(translation.Locale),
		ApplicationScope: string(translation.ApplicationScope),
		Key:              translation.Key,
		Value:            translation.Value,
		Revision:         translation.Revision,
	}
}

func domainGlobalRole(role clinksv1.GlobalRole) domain.GlobalRole {
	switch role {
	case clinksv1.GlobalRole_GLOBAL_ROLE_USER:
		return domain.GlobalRoleUser
	case clinksv1.GlobalRole_GLOBAL_ROLE_SUPER_ADMINISTRATOR:
		return domain.GlobalRoleSuperAdministrator
	default:
		return ""
	}
}

func domainInvitationStatus(status clinksv1.InvitationStatus) domain.InvitationStatusFilter {
	switch status {
	case clinksv1.InvitationStatus_INVITATION_STATUS_PENDING:
		return domain.InvitationStatusFilterPending
	case clinksv1.InvitationStatus_INVITATION_STATUS_USED:
		return domain.InvitationStatusFilterUsed
	case clinksv1.InvitationStatus_INVITATION_STATUS_EXPIRED:
		return domain.InvitationStatusFilterExpired
	case clinksv1.InvitationStatus_INVITATION_STATUS_REVOKED:
		return domain.InvitationStatusFilterRevoked
	case clinksv1.InvitationStatus_INVITATION_STATUS_UNSPECIFIED:
		return domain.InvitationStatusFilterAll
	default:
		return ""
	}
}

func auditFilter(request *clinksv1.ListAuditEventsRequest) (domain.AuditFilter, error) {
	if request == nil {
		return domain.AuditFilter{}, nil
	}

	filter := domain.AuditFilter{
		Action:   request.GetAction(),
		Cursor:   domain.Cursor(request.GetCursor()),
		PageSize: int(request.GetPageSize()),
	}

	var err error
	if filter.From, err = parseOptionalTime(request.GetFrom()); err != nil {
		return domain.AuditFilter{}, err
	}
	if filter.To, err = parseOptionalTime(request.GetTo()); err != nil {
		return domain.AuditFilter{}, err
	}

	if actorID := request.GetActorId(); actorID != "" {
		filter.ActorID = new(domain.UserID(actorID))
	}
	if tenantID := request.GetTenantId(); tenantID != "" {
		filter.TenantID = new(domain.TenantID(tenantID))
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
	locale := server.requestLocale(header)
	messages := make([]*clinksv1.AuditEvent, 0, len(events))

	for i := range events {
		event := &events[i]
		message := &clinksv1.AuditEvent{
			Id:          string(event.ID),
			OccurredAt:  event.OccurredAt.UTC().Format(time.RFC3339),
			ActorEmail:  event.ActorEmail,
			TenantName:  event.TenantName,
			Action:      event.Action,
			Target:      event.Target,
			Description: server.translator.AuditDescription(ctx, locale, *event),
		}
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
