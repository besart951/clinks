# Architecture

The server is a flat Go application. Application behavior and shared domain
types live in the root `clinks` package. One-level packages own concrete
technical concerns:

- `auth`: JWT, password hashing, invitation tokens, and Google OIDC.
- `config`: environment configuration.
- `localization`: the product catalog and localized public-error mapping.
- `mail`: SMTP invitation delivery.
- `postgres`: one pgx `Store`, migrations, RLS transactions, and UUIDv7 generation.
- `web`: Connect-RPC handlers, cookies, browser policy, locale extraction, and response mapping.

There are no `domain`, `ports`, `service`, `controller`, or `repository`
package layers. Interfaces are defined by the package that consumes them. The
root application package owns the small store interfaces required by its
operations; `web` and `localization` own their boundary interfaces locally.
Concrete implementations do not import interface packages merely to declare
conformance. `cmd/server` and `cmd/worker` wire concrete values together.

The API and worker have direct composition roots under `cmd/server` and `cmd/worker`. Command-only types and constructors remain unexported. The API graph never constructs SMTP. Worker `run` validates SMTP during composition and fails before polling; worker `healthcheck` constructs only PostgreSQL connectivity.

Connect-RPC is the only public application interface. `/healthz` and `/readyz` remain plain HTTP. The browser client is generated from `server/proto`, sends `credentials: include`, and hydrates from `GetSession`; no application token is exposed to JavaScript.

Migrations are embedded from `server/migrations` and applied transactionally under a PostgreSQL advisory lock with deterministic ordering and checksums. The initial deployment uses a reset-only two-file baseline. Multi-tenant tables use `WithTenantTx`, which establishes `SET LOCAL app.current_tenant`; authentication resolution and global control-plane actions use the explicitly named system transaction helper.

PostgreSQL bootstrap and runtime identities are separate. The bootstrap superuser creates a non-superuser application owner during first database initialization; all server processes use that application identity, and pool construction rejects `SUPERUSER` or `BYPASSRLS` roles.

`users.global_role` owns global authorization. Tenant authorization is reloaded as Membership → Role → Permissions rather than trusted from JWT claims. JWT claims contain only User ID, optional active Tenant ID, and session revision. Managed mutations use optimistic revisions. Cross-aggregate guarantees—session invalidation, audit insertion, and final-Administrator protection—are enforced in the same PostgreSQL transaction as the state change.

Managed lists expose explicit sort enums, stable ID or compound-key tie-breakers, bounded search/page sizes, opaque cursors, and no total counts. Filtering, sorting, and `LIMIT + 1` keyset pagination execute in PostgreSQL. Versioned cursors bind the normalized filters, sort field, and direction and are invalid when reused with a different query.
