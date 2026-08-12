# Architecture

The server is a modular Go monolith using hexagonal architecture:

- core/domain: dependency-free entities, value types, and domain errors.
- core/ports: interfaces needed by use cases.
- core/service: application use cases.
- adapters/postgres: one pgx `Store`, migrations, RLS transactions, and UUIDv7 generation.
- adapters/i18n: backend translation lookup and localized error mapping.
- adapters/http: Connect-RPC transport, cookie-session extraction, Origin/CORS enforcement, locale extraction, and localized response formatting.

Deep application modules own identity/session, Invitations, Tenancy/Memberships/Tenant Roles, localization, audit, Super Administration, and Invitation delivery. Consumer-owned ports keep each hexagonal seam small. The PostgreSQL Store implements those ports without exposing pool-owning repository objects. Adapters depend inward on ports and domain; the domain has no knowledge of HTTP, PostgreSQL, JWT, SMTP, or UI.

The API and worker have direct composition roots under `cmd/server` and `cmd/worker`. The API graph never constructs SMTP. Worker `run` validates SMTP during composition and fails before polling; worker `healthcheck` constructs only PostgreSQL connectivity.

Connect-RPC is the only public application interface. `/healthz` and `/readyz` remain plain HTTP. The browser client is generated from `server/proto`, sends `credentials: include`, and hydrates from `GetSession`; no application token is exposed to JavaScript.

Migrations are embedded from `server/migrations` and applied transactionally under a PostgreSQL advisory lock with deterministic ordering and checksums. The initial deployment uses a reset-only two-file baseline. Multi-tenant tables use `WithTenantTx`, which establishes `SET LOCAL app.current_tenant`; authentication resolution and global control-plane actions use the explicitly named system transaction helper.

PostgreSQL bootstrap and runtime identities are separate. The bootstrap superuser creates a non-superuser application owner during first database initialization; all server processes use that application identity, and pool construction rejects `SUPERUSER` or `BYPASSRLS` roles.

`users.global_role` owns global authorization. Tenant authorization is reloaded as Membership → Role → Permissions rather than trusted from JWT claims. JWT claims contain only User ID, optional active Tenant ID, and session revision. Managed mutations use optimistic revisions. Cross-aggregate guarantees—session invalidation, audit insertion, and final-Administrator protection—are enforced in the same PostgreSQL transaction as the state change.

Managed lists expose explicit sort enums, stable ID or compound-key tie-breakers, bounded search/page sizes, opaque cursors, and no total counts. Filtering, sorting, and `LIMIT + 1` keyset pagination execute in PostgreSQL. Versioned cursors bind the normalized filters, sort field, and direction and are invalid when reused with a different query.
