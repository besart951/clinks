# Security guidelines

## Identity and authorization

- Passwords use bcrypt with the current cost. Passwords, password hashes, tokens, and database URLs are never logged.
- JWTs are HMAC-SHA-256 signed with JWT_SECRET, expire after a short configured period, and are validated for issuer, audience, algorithm, and expiry. They are only transported in the HttpOnly, `SameSite=Lax` session cookie and are never returned to JavaScript.
- Administrative RPCs require ROLE_SUPER_ADMIN. Tenant RPCs require an active Membership; switching the active Tenant validates that Membership, rotates the session, and only then establishes the tenant RLS context.
- Bootstrap credentials come exclusively from ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_LOCALE in .env. The bootstrap is idempotent and never prints the password.

## Multi-tenancy

- PostgreSQL RLS is enabled and forced on tenant data.
- Code must use the repository tenant transaction helper, which begins a transaction and executes SET LOCAL app.current_tenant before any tenant query.
- Super administrators never receive a tenant-scoped repository access path or a Membership.
- Invitations persist only a SHA-256 token hash, are email-bound, time-bound, and single-use. SMTP delivery failures do not expose token material beyond the already-authorized copyable acceptance URL.
- Audit Events are append-only at the database level. Metadata is scrubbed of password, hash, and token fields before persistence.

## HTTP boundary

- Connect-RPC is the application boundary. Browser requests use credentialed CORS. Mutating requests with an Origin must match CORS_ORIGINS before they reach a use case.
- Return localized public errors only. Connect errors contain the translated message and `Clinks-Locale`; internal errors are logged server-side and become a generic localized response.
