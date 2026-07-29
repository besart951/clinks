# AGENTS.md — Repository Instructions for AI & Autonomous Agents

Before changing this repository, read [docs/security.md](docs/security.md), [docs/architecture.md](docs/architecture.md), and [codestyle.md](codestyle.md).

## Non-negotiable rules

- Domain entities in server/internal/core/domain are pure Go and have no infrastructure imports.
- Every query for tenant-scoped data runs in a transaction which sets LOCAL app.current_tenant.
- Generate persistent entity IDs with Google UUIDv7.
- The backend localizes every domain and validation error using the request locale. Clients render the returned human-readable message and never translate error keys.
- Use the ports in server/internal/core/ports to cross the hexagonal boundary.
- Keep secrets in .env only. Do not hard-code bootstrap credentials.

## Quality gate

Before handoff, run formatting, tests, and a build. Check for dead code, long methods, duplicated branches, primitive IDs where a domain type is appropriate, and infrastructure leakage into the domain.
