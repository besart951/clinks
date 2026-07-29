# Architecture

The server is a modular Go monolith using hexagonal architecture:

- core/domain: dependency-free entities, value types, and domain errors.
- core/ports: interfaces needed by use cases.
- core/service: application use cases.
- adapters/postgres: pgx repositories, migrations, RLS transactions, and UUIDv7 generation.
- adapters/i18n: backend translation lookup and localized error mapping.
- adapters/http: Connect-RPC transport, cookie-session extraction, Origin/CORS enforcement, locale extraction, and localized response formatting.

Each bounded context owns its own use case and port: identity/session, membership/invitations, tenancy, localization, and audit. Adapters depend inward on ports and domain; the domain has no knowledge of HTTP, PostgreSQL, JWT, SMTP, or UI.

Server construction is declared in cmd/server/wire.go and committed in generated form in cmd/server/wire_gen.go. The generated provider graph connects configuration, PostgreSQL repositories, translation, password hashing, JWT sessions, services, and HTTP routes.

Connect-RPC is the only public application interface. `/healthz` and `/readyz` remain plain HTTP. The browser client is generated from `server/proto`, sends `credentials: include`, and hydrates from `GetSession`; no application token is exposed to JavaScript.

Migrations are embedded from server/migrations and applied once, transactionally and under a PostgreSQL advisory lock during server startup. The migration ledger makes server restarts safe. Multi-tenant tables use `WithTenantTx`, which establishes `SET LOCAL app.current_tenant`; global control-plane actions use the explicitly named system transaction helper. `users.global_role` owns global authorization, while legacy `users.tenant_id` and `users.role` remain write-only compatibility columns for one transition release.
