# CLinks Workspace

Agent rules for this app: [AGENTS.md](AGENTS.md).

The complete SaaS front end for CLinks. Without `VITE_API_URL` it runs **without a backend**. It covers the platform shell, account
and tenant management, and all modules — contacts, calendar, tasks, mail, documents, finance, physio and home care
(Spitex) — through tenant-scoped repositories. Set `VITE_API_URL` to use the API and PowerSync, or leave it unset for the standalone demo.

## Synced workspace

The eight modules use the signed-in tenant’s SQLite repositories. PowerSync delivers rows for the active membership and role. Notifications are private to their recipient. The activity feed and staff directory are read-only projections. Existing local-only rows migrate in a validated transaction. Failed imports retain their source data. Accounts, roles and company settings use the API. The standalone demo keeps its own storage.

Offline edits survive a restart of the installed or previously loaded production build. Reconnecting sends its queued transactions. Invoice numbers appear after server acknowledgement. Clinical notes are append-only. The service worker caches the app shell and static assets. Signing out clears local synced records and account data.

With S3 configured, the first upload (up to 1 MB) travels in the durable write queue. After acknowledgement the database carries the immutable object reference. Viewing the original on another device, replacing a version and restoring a previous one use the file API. The standalone demo keeps file bytes in browser storage. Configure the API’s AWS credentials, bucket and endpoint, and run its bucket initialiser with the retention settings described in the [production runbook](../../infra/production/README.md).

For shared planning notes set VITE_COLLAB_URL (locally ws://localhost:1234), then start `pnpm --filter @clinks/collab start` with DATABASE_URL, TOKEN_ISSUER and JWKS_URL. Online participants see presence and shared edits. Stored Yjs state is tenant-scoped. Run the real-browser tests with TEST_VERSIONED_FILES=1, VITE_COLLAB_URL and VITE_API_URL to include both services.

```sh
pnpm --filter @clinks/web dev       # http://localhost:5176
pnpm --filter @clinks/web test      # unit tests (Vitest)
pnpm --filter @clinks/web test:e2e  # Playwright, uses the local Chrome
pnpm --filter @clinks/web build:artifact  # one self-contained HTML file in build-artifact/
```

## Demo accounts

All accounts use the password `demo1234`.

| Account                  | What it shows                                                       |
| ------------------------ | ------------------------------------------------------------------- |
| `besi@stille.ch`         | Administrator of _Stille Physio_ and _Stille Spitex Seeland_        |
| `sandra.roth@stille.ch`  | Therapist with the protected User role                              |
| `jonas.keller@stille.ch` | Custom _Accounting_ role: finance only, other areas are hidden      |
| `admin@clinks.ch`        | Platform super administrator: tenants, feature flags, support login |

Codes in the prototype: email verification and password reset `000000`, two-factor `123456`.

## How the mock backend works

The UI never touches storage directly. In standalone mode the repositories use the following components:

- `src/lib/data/database.ts` — `MockDatabase`: one in-browser data set persisted to `localStorage`. Each call goes
  through `request()`, which adds latency, can fail on purpose, reports `offline`, and rolls back when the browser
  storage is full.
- `src/lib/data/repository.ts` — `TenantRepository`: tenant-scoped CRUD with permission checks, optimistic revisions
  (stale writes return `conflict`), schema validation and an audit entry per change — the rules a real API would enforce.
- `src/lib/data/account-api.ts` — the control plane: sign-in, sign-up, onboarding, memberships, invitations, roles
  (protected Administrator/User roles, last-administrator rule), billing and the platform view.
- `src/lib/data/schemas.ts` — Zod schemas shared by mock server and forms. Error messages are translation keys and
  come back **already localized**, so screens render them verbatim like real API errors.
- `src/lib/data/seed.ts` — deterministic demo data relative to today. Reset it in the developer menu (wrench button,
  bottom right), where latency, failure rate and offline mode can also be simulated.

Both backends implement the same repository methods (`list`, `get`, `create`, `update`,
`remove`, `restore`).

## Structure

```
src/lib/domain/      pure types and rules: money and VAT, QR bill, scheduling, plans, permissions
src/lib/data/        mock API (see above)
src/lib/session/     fake session with tenant switching and impersonation
src/lib/i18n/        resolves localization/product-catalog.json (de-CH, en-US) in the browser
src/lib/state/       Resource (loading/empty/error/forbidden + live reload), theme
src/lib/features/    view models per area (classes with Svelte runes)
src/lib/components/  shell, shared building blocks, module components
src/routes/          hash-routed pages; (app) is the signed-in shell
test/                unit tests and Playwright specs
```

All texts are keys in `localization/product-catalog.json` (`ui.ws.*`, `error.ws.*`); run `pnpm generate:translations`
after changing it. The app uses hash routing so the static build works anywhere, including as a single HTML file.

## Standalone demo limitations

No data leaves the browser: mail is not sent, payments are not charged, files stay in `localStorage` (1 MB per
file). The demo network simulator can reject requests. The connected build exercises the durable offline queue.
