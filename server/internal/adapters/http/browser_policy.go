package http

import (
	stdhttp "net/http"
	"strings"

	"github.com/besartmorina/clinks/server/proto/clinks/v1/clinksv1connect"
)

const corsMaxAgeSeconds = "86400" // 24 hours

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
		if normalized := normalizeOrigin(origin); normalized != "" {
			allowedOrigins[normalized] = struct{}{}
		}
	}
	return browserPolicy{origins: allowedOrigins}
}

func (policy browserPolicy) protect(next stdhttp.Handler) stdhttp.Handler {
	return policy.cors(policy.originGuard(next))
}

func (policy browserPolicy) cors(next stdhttp.Handler) stdhttp.Handler {
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		origin := normalizeOrigin(r.Header.Get("Origin"))
		if policy.allows(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms, Accept-Language")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", corsMaxAgeSeconds)
			w.Header().Add("Vary", "Origin")
		}

		if r.Method == stdhttp.MethodOptions {
			w.WriteHeader(stdhttp.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (policy browserPolicy) originGuard(next stdhttp.Handler) stdhttp.Handler {
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		origin := normalizeOrigin(r.Header.Get("Origin"))
		if origin != "" && policy.requiresTrustedOrigin(r.URL.Path) && !policy.allows(origin) {
			stdhttp.Error(w, "forbidden origin", stdhttp.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (policy browserPolicy) allows(origin string) bool {
	if origin == "" {
		return false
	}
	_, allowed := policy.origins[origin]
	return allowed
}

func (browserPolicy) requiresTrustedOrigin(procedure string) bool {
	_, readOnly := readOnlyProcedures[procedure]
	return !readOnly
}

func normalizeOrigin(origin string) string {
	return strings.ToLower(strings.TrimRight(strings.TrimSpace(origin), "/"))
}
