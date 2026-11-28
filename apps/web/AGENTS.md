# apps/web — SvelteKit SPA

Static single-page app (adapter-static, hash router). No SSR and no server routes: all server logic is in `apps/api`.
The app `tsconfig` must extend `$app/tsconfig`. The same rules apply to `packages/ui`.

## Data and backend modes

- Without `VITE_API_URL` everything runs on the in-browser mock (`src/lib/data/database.ts` `MockDatabase`,
  `repository.ts`, `account-api.ts`, `seed.ts`). Demo sign-in `besi@stille.ch` / `demo1234`, codes `000000`
  (verify/reset) and `123456` (2FA). The single-file build and `pnpm test:e2e` use this mode.
- With `VITE_API_URL` sign-in goes through `session/remote-auth.ts` (behind `AuthGateway`; the mock twin is
  `mock-auth.ts`), and synced tables go through `src/lib/sync` (`@powersync/web`, lazy-loaded only in this mode).
  Writes land in local SQLite first and go up via `POST /sync/write`.
- Screens and view models depend only on repository methods (`list`, `get`, `create`, `update`, `remove`,
  `restore`, `subscribe`) and platform interfaces (`src/lib/platform`: `FileStore`, `SecureStorage`, `Notifier`,
  `Updater`). Never call `fetch`, `localStorage` or IndexedDB from a screen.
- Errors arrive localized from the API or mock; render them verbatim, no local error maps.

## Svelte 5

- Runes only. `$derived` / `$derived.by()` for computed values; event handlers for actions and mutations.
  `$effect` only for DOM measurement, non-reactive third-party integrations and cleanup — never to sync state.
- Feature logic lives in view-model classes in `src/lib/features` with rune fields (`busy = $state(false)`), created
  in the component or provided via `setContext`/`getContext`.
- One responsibility per component; split when a component holds more than 5–8 pieces of state.
- At most 3–4 props or parameters; group related values into one typed object (pass `user: UserProfile`, not
  `name`, `email`, `role`, …).
- Prefer `function name() {}` and method syntax; arrow functions for short inline callbacks.

## UI

- Use the shadcn-svelte components in `packages/ui/src/lib/components/ui` first; add a missing one there with the
  shadcn-svelte CLI instead of hand-rolling it. App-specific building blocks go in `packages/ui/src/lib/kit`.
- Tailwind utilities, tokens from the design system ([docs/design-system](../../docs/design-system)); accessible
  labels, focus states and live regions; keyboard-operable controls.
- Every visible text is a catalog key (`ui.ws.*`, `error.ws.*`). Dates and CHF in de-CH format.
- Run the `modern-web-guidance` skill before writing HTML/CSS/client JS (see root `AGENTS.md`).

For UI changes, follow the [desktop and mobile review](../../docs/design-system/responsive-review.md) and verify the opened interaction with populated data.

## Tests

- Tests live in `test/`, never next to code in `src/`. Unit: Vitest (`pnpm --filter @clinks/web test`).
- E2E: `test/e2e`, Playwright with the installed Chrome. `pnpm test:e2e` runs on the mock; `test:e2e:remote` runs
  against the production build + preview with the real API (offline navigation needs the built app).
- Add or update an e2e path when you change a user flow.
