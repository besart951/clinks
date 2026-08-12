package http

import (
	"fmt"
	stdhttp "net/http"
	"net/url"
	"strings"
)

const corsMaxAgeSeconds = "7200"

const (
	corsAllowedMethods = "GET, POST"
	corsAllowedHeaders = "Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms, Grpc-Timeout, X-Grpc-Web, X-User-Agent, Accept-Language"
	corsExposedHeaders = "Grpc-Status, Grpc-Message, Grpc-Status-Details-Bin, Clinks-Locale, Clinks-Error-Kind, Retry-After"
)

type browserPolicy struct {
	origins map[string]struct{}
	csrf    *stdhttp.CrossOriginProtection
}

func newBrowserPolicy(origins []string) (browserPolicy, error) {
	policy := browserPolicy{
		origins: make(map[string]struct{}, len(origins)),
		csrf:    stdhttp.NewCrossOriginProtection(),
	}

	for _, rawOrigin := range origins {
		origin, err := canonicalOrigin(rawOrigin)
		if err != nil {
			return browserPolicy{}, fmt.Errorf("invalid origin %q: %w", rawOrigin, err)
		}

		if err := policy.csrf.AddTrustedOrigin(origin); err != nil {
			return browserPolicy{}, fmt.Errorf("trust origin %q: %w", origin, err)
		}

		policy.origins[origin] = struct{}{}
	}

	return policy, nil
}

func (policy browserPolicy) protect(next stdhttp.Handler) stdhttp.Handler {
	return policy.cors(policy.csrf.Handler(next))
}

func (policy browserPolicy) cors(next stdhttp.Handler) stdhttp.Handler {
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		originHeader := r.Header.Get("Origin")
		if originHeader == "" {
			next.ServeHTTP(w, r)
			return
		}

		w.Header().Add("Vary", "Origin")
		w.Header().Add("Vary", "Access-Control-Request-Method")
		w.Header().Add("Vary", "Access-Control-Request-Headers")

		origin, err := canonicalOrigin(originHeader)
		if err != nil || !policy.allows(origin) {
			if r.Method == stdhttp.MethodOptions {
				stdhttp.Error(w, "forbidden origin", stdhttp.StatusForbidden)
				return
			}

			// For actual requests, CrossOriginProtection performs the CSRF decision.
			// Safe cross-origin requests may proceed, but the browser cannot expose
			// the response because no Access-Control-Allow-Origin header is present.
			next.ServeHTTP(w, r)
			return
		}

		header := w.Header()
		header.Set("Access-Control-Allow-Origin", origin)
		header.Set("Access-Control-Allow-Credentials", "true")
		header.Set("Access-Control-Allow-Methods", corsAllowedMethods)
		header.Set("Access-Control-Allow-Headers", corsAllowedHeaders)
		header.Set("Access-Control-Expose-Headers", corsExposedHeaders)
		header.Set("Access-Control-Max-Age", corsMaxAgeSeconds)

		if r.Method == stdhttp.MethodOptions {
			w.WriteHeader(stdhttp.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (policy browserPolicy) allows(origin string) bool {
	_, ok := policy.origins[origin]
	return ok
}

func canonicalOrigin(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimSuffix(raw, "/")
	if raw == "" {
		return "", fmt.Errorf("origin is empty")
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", fmt.Errorf("unsupported scheme %q", parsed.Scheme)
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("host is required")
	}
	if parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", fmt.Errorf("origin must contain only scheme and host")
	}

	return scheme + "://" + strings.ToLower(parsed.Host), nil
}
