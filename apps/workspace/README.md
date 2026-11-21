# CLinks Workspace (UI prototype)

A complete, clickable SaaS front end for CLinks that runs **without a backend**. It covers the platform shell, account
and tenant management, and all modules — contacts, calendar, tasks, mail, documents, finance, physio and home care
(Spitex) — on top of a mock API that lives in the browser.

```sh
pnpm --filter @clinks/workspace dev       # http://localhost:5176
pnpm --filter @clinks/workspace test      # unit tests (node --test)
pnpm --filter @clinks/workspace test:e2e  # Playwright, uses the local Chrome
pnpm --filter @clinks/workspace build:artifact  # one self-contained HTML file in build-artifact/
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

The UI never touches storage directly. Every screen talks to the same kind of API the Go server offers:

- `src/lib/data/database.ts` — `MockDatabase`: one in-browser data set persisted to `localStorage`. Each call goes
  through `request()`, which adds latency, can fail on purpose, reports `offline`, and rolls back when the browser
  storage is full.
- `src/lib/data/repository.ts` — `TenantRepository`: tenant-scoped CRUD with permission checks, optimistic revisions
  (stale writes return `conflict`), schema validation and an audit entry per change — the same rules as the API.
- `src/lib/data/account-api.ts` — the control plane: sign-in, sign-up, onboarding, memberships, invitations, roles
  (protected Administrator/User roles, last-administrator rule), billing and the platform view.
- `src/lib/data/schemas.ts` — Zod schemas shared by mock server and forms. Error messages are translation keys and
  come back **already localized**, so screens render them verbatim like real API errors.
- `src/lib/data/seed.ts` — deterministic demo data relative to today. Reset it in the developer menu (wrench button,
  bottom left), where latency, failure rate and offline mode can also be simulated.

Moving to the real backend means replacing these files with Connect-RPC calls from `@clinks/api-client`; screens and
view models keep working because they only depend on the repository methods (`list`, `get`, `create`, `update`,
`remove`, `restore`).

## Structure

```
src/lib/domain/      pure types and rules: money and VAT, QR bill, scheduling, plans, permissions
src/lib/data/        mock API (see above)
src/lib/session/     fake session with tenant switching and impersonation
src/lib/i18n/        resolves localization/product-catalog.json (de-CH, en-US) like the server does
src/lib/state/       Resource (loading/empty/error/forbidden + live reload), theme
src/lib/features/    view models per area (classes with Svelte runes)
src/lib/components/  shell, shared building blocks, module components
src/routes/          hash-routed pages; (app) is the signed-in shell
test/                unit tests and Playwright specs
```

All texts are keys in `localization/product-catalog.json` (`ui.ws.*`, `error.ws.*`); run `pnpm generate:translations`
after changing it. The app uses hash routing so the static build works anywhere, including as a single HTML file.

## Not part of the prototype

No data leaves the browser: mail is not sent, payments are not charged, files stay in `localStorage` (1 MB per
file). Offline changes are rejected, not queued; a service worker, push notifications and background sync come with
the real backend.
