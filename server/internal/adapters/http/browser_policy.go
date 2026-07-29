package http

import (
	stdhttp "net/http"
	"strings"

	"github.com/besartmorina/clinks/server/proto/clinks/v1/clinksv1connect"
)

type browserPolicy struct {
	origins map[string]struct{}
}

var readOnlyProcedures = map[string]struct{}{
	clinksv1connect.ClinksServiceGetSessionProcedure:           {},
	clinksv1connect.ClinksServiceGetLanguagesProcedure:         {},
	clinksv1connect.ClinksServiceGetTranslationsProcedure:      {},
	clinksv1connect.ClinksServiceListTenantsProcedure:          {},
	clinksv1connect.ClinksServiceListManagedLanguagesProcedure: {},
	clinksv1connect.ClinksServiceListAuditEventsProcedure:      {},
}

func newBrowserPolicy(origins []string) browserPolicy {
	allowedOrigins := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		allowedOrigins[normalizeOrigin(origin)] = struct{}{}
	}
	return browserPolicy{origins: allowedOrigins}
}

func (policy browserPolicy) protect(next stdhttp.Handler) stdhttp.Handler {
	return policy.cors(policy.originGuard(next))
}

func (policy browserPolicy) cors(next stdhttp.Handler) stdhttp.Handler {
	return stdhttp.HandlerFunc(func(response stdhttp.ResponseWriter, request *stdhttp.Request) {
		origin := normalizeOrigin(request.Header.Get("Origin"))
		if policy.allows(origin) {
			response.Header().Set("Access-Control-Allow-Origin", origin)
			response.Header().Set("Access-Control-Allow-Credentials", "true")
			response.Header().Set("Access-Control-Allow-Headers", "Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms, Accept-Language")
			response.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			response.Header().Add("Vary", "Origin")
		}
		if request.Method == stdhttp.MethodOptions {
			response.WriteHeader(stdhttp.StatusNoContent)
			return
		}
		next.ServeHTTP(response, request)
	})
}

func (policy browserPolicy) originGuard(next stdhttp.Handler) stdhttp.Handler {
	return stdhttp.HandlerFunc(func(response stdhttp.ResponseWriter, request *stdhttp.Request) {
		origin := normalizeOrigin(request.Header.Get("Origin"))
		if origin != "" && policy.requiresTrustedOrigin(request.URL.Path) && !policy.allows(origin) {
			stdhttp.Error(response, "forbidden origin", stdhttp.StatusForbidden)
			return
		}
		next.ServeHTTP(response, request)
	})
}

func (policy browserPolicy) allows(origin string) bool {
	_, allowed := policy.origins[origin]
	return allowed
}

func (browserPolicy) requiresTrustedOrigin(procedure string) bool {
	_, readOnly := readOnlyProcedures[procedure]
	return !readOnly
}

func normalizeOrigin(origin string) string {
	return strings.TrimRight(origin, "/")
}
