package web

import (
	"context"

	"connectrpc.com/connect"

	clinks "github.com/besartmorina/clinks/server"
	clinksv1 "github.com/besartmorina/clinks/server/proto/clinks/v1"
)

func (server *Server) GetLanguages(ctx context.Context, request *connect.Request[clinksv1.Empty]) (*connect.Response[clinksv1.LanguagesResponse], error) {
	languages, err := server.localization.catalog.ActiveLanguages(ctx)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.LanguagesResponse{
		Languages: languageMessages(languages),
	}), nil
}

func (server *Server) GetTranslations(ctx context.Context, request *connect.Request[clinksv1.GetTranslationsRequest]) (*connect.Response[clinksv1.TranslationsResponse], error) {
	scope, err := clinks.ParseApplicationScope(request.Msg.GetApplicationScope())
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}
	bundle, err := server.localization.catalog.TranslationBundle(ctx, server.requestLocale(request.Header()), scope)
	if err != nil {
		return nil, server.localizedError(ctx, request.Header(), err)
	}

	return connect.NewResponse(&clinksv1.TranslationsResponse{
		Locale:       string(bundle.Locale),
		Translations: translationMessages(bundle.Translations),
	}), nil
}
