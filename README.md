# clinks

Go 1.26 monolith with a Svelte 5 / Vite 8 workspace for the Admin, planer_link, and infra_link applications.

1. Copy .env.example to .env and replace every secret placeholder.
2. Run pnpm start.

The one command starts PostgreSQL, applies pending embedded migrations exactly once, creates the configured super-admin when it does not yet exist, then serves:

- Admin: http://localhost:5173
- planer_link: http://localhost:5174
- infra_link: http://localhost:5175
- API health: http://localhost:8080/healthz

The browser API is Connect-RPC at `http://localhost:8080/clinks.v1.ClinksService/*`. Browser sessions are HttpOnly cookies; API tokens are never stored in localStorage. Configure `SMTP_*` to send invitations by email. Every invitation response also includes a copyable acceptance link.

The first administrator is ADMIN_EMAIL / ADMIN_PASSWORD from .env. Changing these values later does not overwrite an existing password; it only supplies credentials when the account is absent. For local frontend-only development use pnpm install then pnpm dev with a running PostgreSQL instance and DATABASE_URL set in .env.

## Go quality tools

The repository pins its Go developer tools in `server/go.mod`, using Go's native `tool` directives. No global Go tool installation is required.

- `pnpm go:format` formats Go files and organizes imports.
- `pnpm go:lint`, `pnpm go:vet`, `pnpm go:test`, `pnpm go:security`, and `pnpm go:vuln` run the individual quality checks.
- `pnpm go:check` runs the complete backend quality gate, including module tidiness and a production build.
- `pnpm go:generate` refreshes generated Go code after a Wire provider change.
