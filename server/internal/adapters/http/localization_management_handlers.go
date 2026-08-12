package http

import (
	"context"

	"connectrpc.com/connect"

	"github.com/besartmorina/clinks/server/internal/core/domain"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
)

func (server *Server) ListTranslationOverrides(
	ctx context.Context,
	request *connect.Request[clinksv1.ListTranslationOverridesRequest],
) (*connect.Response[clinksv1.ListTranslationOverridesResponse], error) {
	if _, err := server.authorizeSuperAdmin(ctx, request.Header()); err != nil {
		return nil, err
	}
	sort, validSort := translationSort(request.Msg.GetSort())
	direction, validDirection := sortDirection(request.Msg.GetDirection(), domain.SortAscending)
	if !validSort || !validDirection {
		return nil, server.localizedError(ctx, request.Header(), domain.NewError(domain.ErrorValidation))
	}
	filter := domain.TranslationFilter{
		Search: request.Msg.GetSearch(), Sort: sort, Direction: direction,
		Cursor: domain.Cursor(request.Msg.GetCursor()), Limit: int(request.Msg.GetPageSize()),
	}
	if request.Msg.GetLocale() != "" {
		locale, err := domain.ParseLocale(request.Msg.GetLocale())
		if err != nil {
			return nil, server.localizedError(ctx, request.Header(), err)
		}
		filter.Locale = &locale
	}
	if request.Msg.GetApplicationScope() != "" {
		scope, err := domain.ParseApplicationScope(request.Msg.GetApplicationScope())
		if err != nil {
			return nil, server.localizedError(ctx, request.Header(), err)
		}
		filter.ApplicationScope = &scope
	}
	page, err := server.localizationEdit.TranslationOverrides(ctx, filter)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	messages := make([]*clinksv1.TranslationOverride, len(page.Items))
	for index, translation := range page.Items {
		messages[index] = translationOverrideMessage(translation)
	}
	return connect.NewResponse(&clinksv1.ListTranslationOverridesResponse{Overrides: messages, NextCursor: string(page.NextCursor)}), nil
}

func (server *Server) DeleteTranslationOverride(
	ctx context.Context,
	request *connect.Request[clinksv1.DeleteTranslationOverrideRequest],
) (*connect.Response[clinksv1.Empty], error) {
	user, err := server.authorizeSuperAdmin(ctx, request.Header())
	if err != nil {
		return nil, err
	}
	scope, err := domain.ParseApplicationScope(request.Msg.GetApplicationScope())
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	err = server.localizationEdit.DeleteTranslationOverride(ctx, domain.Translation{
		Locale: domain.NewLocale(request.Msg.GetLocale()), ApplicationScope: scope,
		Key: request.Msg.GetKey(), Revision: request.Msg.GetRevision(),
	}, user.ID)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	return connect.NewResponse(&clinksv1.Empty{}), nil
}
