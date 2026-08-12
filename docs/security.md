# Security guidelines

## Identity and authorization

- Passwords use bcrypt with the current cost. Passwords, password hashes, tokens, and database URLs are never logged.
- JWTs are HMAC-SHA-256 signed with JWT_SECRET, expire after a short configured period, and are validated for issuer, audience, algorithm, and expiry. They are only transported in the HttpOnly, `SameSite=Lax` session cookie and are never returned to JavaScript.
- Administrative RPCs require the `super_administrator` Global Role. Tenant RPCs require an active Membership and the operation-specific Permission. Switching the active Tenant validates that Membership, rotates the session, and only then establishes the tenant RLS context.
- JWT claims contain only User ID, optional active Tenant ID, and session revision. Email, locale, Global Role, Membership, Role, and Permissions are reloaded for authorization.
- Bootstrap credentials come exclusively from ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_LOCALE in .env. The bootstrap is idempotent and never prints the password.

## Multi-tenancy

- PostgreSQL RLS is enabled and forced on tenant data.
- API, migration, and worker processes connect as a dedicated non-superuser role without `BYPASSRLS`. Pool startup rejects unsafe roles. The Docker bootstrap superuser is used only to create the application role.
- Tenant operations enter PostgreSQL through the Store's tenant transaction helper, which begins a transaction and executes SET LOCAL app.current_tenant before any tenant query. Global control-plane and authentication operations use the explicitly named system transaction path.
- Super administrators never receive a tenant-scoped store access path or a Membership.
- Membership changes lock the Tenant to serialize Administrator mutations. The final-Administrator check, affected-User session invalidation, mutation, and Audit Event happen atomically in that tenant transaction.
- Invitation acceptance creates or resolves the User, links an external identity when applicable, creates the Membership, consumes the Invitation, and appends exactly one Audit Event in one transaction.
- Invitations persist only a SHA-256 token hash, are email-bound, time-bound, and single-use. SMTP delivery failures do not expose token material beyond the already-authorized copyable acceptance URL.
- Audit Events are append-only at the database level. Metadata is scrubbed of password, hash, and token fields before persistence.
- Persistent entity IDs are UUIDv7. Mutable control-plane records use optimistic revisions; stale writes return a localized conflict.

## HTTP boundary

- Connect-RPC is the application boundary. Browser requests use credentialed CORS. Mutating requests with an Origin must match CORS_ORIGINS before they reach a use case.
- Return localized public errors only. Connect errors contain the translated message and `Clinks-Locale`; internal errors are logged server-side and become a generic localized response.
