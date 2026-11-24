# Security review (internal)

Date: 24.11.2026 · Scope: API, database, sync, collaboration server, web client, production templates in
`infra/production` · Method: code and configuration read against the security table in [plan.md](plan.md#security-and-operations),
checks against a migrated test database, `pnpm audit --prod`, secret scan of the repository. This is an internal
review before go-live; it does not replace the external penetration test planned for phase 6.

## Result

No critical or high findings. Six medium and low findings were fixed in the same PR; the residual risks below are
accepted for the pilot or planned.

| Area             | Checked                                                                                                                                                                                              | Result   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Login            | argon2id (19 MiB, t=2), lockout 15 min after failed attempts, rate limits per IP and e-mail for sign-in, sign-up, reset, verification and password change; one-time codes single use with 5 attempts | ok       |
| Tokens           | EdDSA access tokens 15 min with issuer and audience checked; refresh tokens hashed, rotated per use, reuse after a 30 s grace revokes the device; cookie `HttpOnly`, `Secure`, `SameSite=Strict`     | ok       |
| Tenant isolation | Sync streams filter by `tenant_id` claim and active membership; every tenant table has row-level security enabled and forced (now a regression test); `auth` schema not published to PowerSync       | ok       |
| Writes           | Zod validation, permission check and audit entry in one transaction (21 audited actions)                                                                                                             | ok       |
| Files            | Private bucket, signed URLs 300 s, size and MIME type checked on upload and again on commit; tenants' own buckets: secret sealed with JWE, HTTPS only, public addresses only                         | fixed F1 |
| Payments         | Stripe webhook signature checked (`constructEvent`), handlers idempotent; only `sk_test_` keys in the repo and only in the catalog script and test fixtures                                          | ok       |
| Live rooms       | Hocuspocus verifies the JWT (EdDSA, issuer, audience), room name must equal the token's tenant, session and permission re-checked every 15 s and per message                                         | ok       |
| Device data      | Sign-out wipes the local PowerSync database; idle sign-out; pending offline writes survive until upload                                                                                              | ok       |
| Transport        | TLS by Caddy; HSTS, `nosniff`, referrer policy and framing protection were missing on the web host                                                                                                   | fixed F2 |
| Browser          | No Content Security Policy                                                                                                                                                                           | fixed F3 |
| Proxy            | Client IP for rate limits read from the first `X-Forwarded-For` entry                                                                                                                                | fixed F4 |
| Database roles   | App role could write the migration ledger                                                                                                                                                            | fixed F5 |
| Dependencies     | `pnpm audit --prod`: no known vulnerabilities; `minimumReleaseAge` stays on                                                                                                                          | ok       |
| Secrets          | No keys in the repository; production refuses to start without `SIGNING_KEY`, `STORAGE_SECRET_KEY` and a private bucket, and with `STORAGE_ALLOW_INTERNAL`                                           | ok       |

## Fixed findings

**F1 · SSRF through a tenant's storage endpoint (medium).** Administrators enter their own S3 endpoint, which the API
calls. Endpoints must use HTTPS, and every address the host resolves to must be public (loopback, private,
link-local including `169.254.169.254`, CGNAT, IPv6 ULA/link-local, IPv4-mapped forms). The check runs on save and
before a client is opened, and — closing DNS rebinding — again inside the HTTPS agent's DNS lookup at the moment each
connection opens (`publicLookup` in `apps/api/src/endpoint-guard.ts`). Unit tests cover the address ranges, the
rebinding case and that the S3 client really uses the guarded lookup.

**F2 · Missing security headers (low).** The Caddyfile now sends HSTS (one year, no `includeSubDomains` so other
subdomains stay free), `X-Content-Type-Options`, `Referrer-Policy` and drops `Server` on every host; the web host also
sends `frame-ancestors 'none'`, `X-Frame-Options: DENY` and a restrictive `Permissions-Policy`. Validated with
`caddy validate`.

**F3 · No Content Security Policy (medium).** The build now emits a CSP `<meta>` tag with a hash for SvelteKit's
inline start script: scripts only from the app's origin (plus `wasm-unsafe-eval` for SQLite in PowerSync), no
plugins, no foreign `<base>` or form targets. Every browser test fails if the page reports a CSP violation.

**F4 · Spoofable client IP (low).** Behind Caddy the API took the first `X-Forwarded-For` entry, which the client can
set, and so could dodge IP rate limits. It now takes the last entry, the one Caddy appends.

**F5 · Migration ledger writable by the app role (low).** The blanket grant in migration 0001 included
`schema_migrations`. Migration 0011 revokes it; a regression test checks the grant and that row-level security stays
enabled and forced on every table.

## Residual risks and follow-ups

| Risk                                                                                                                                      | Decision                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `users`, `system_status` and the four `auth` tables have no row-level security: the API reads them before a tenant is known               | Accepted; reached only through the API's own queries, never synced directly; listed in the RLS test    |
| CSP allows `connect-src https:` (uploads go to signed URLs of buckets tenants choose) and `style-src 'unsafe-inline'` (UI library styles) | Accepted; scripts stay locked down, which is what stops injected code                                  |
| Rate limits are counted in memory                                                                                                         | Fine for one API instance; move to Postgres before running several                                     |
| `STORAGE_SECRET_KEY` has no rotation yet: a new key makes saved tenant secrets unreadable (they must be entered again, the API says so)   | Plan rotation with a key id in the JWE header before the first key change                              |
| Tenants' own buckets: CLinks cannot enforce object lock or lifecycle rules there                                                          | The connection test checks versioning; the settings page states the data location and asks for consent |
| External penetration test                                                                                                                 | Before the pilot goes live (phase 6)                                                                   |
