# clinks

clinks is a backend-free, clickable prototype of the complete CLinks SaaS: platform shell, contacts, calendar, tasks,
mail and campaigns, documents, finance with Swiss QR bills, Physio and Spitex — all running on a mock API in the
browser. Details: [`apps/workspace`](apps/workspace/README.md).

```
apps/workspace        SvelteKit app (Svelte 5, Tailwind 4), mock API, tests
packages/ui-shared    shadcn-svelte components shared by apps
packages/i18n-types   generated translation keys
localization          product-catalog.json – every UI text in de-CH and en-US
scripts               translation catalog generator
```

## Development

You need Node.js 24+ and pnpm 10+.

```sh
pnpm install
pnpm dev            # http://localhost:5176
```

Demo sign-in: `besi@stille.ch` / `demo1234` (more accounts on the sign-in page).

## Checks

```sh
pnpm verify:push    # format check, type checks, translations, unit tests, build
pnpm test:e2e       # Playwright (uses the installed Chrome)
```

After changing `localization/product-catalog.json` run `pnpm generate:translations`.

## Single-file build

`pnpm build:artifact` writes `apps/workspace/build-artifact/index.html`: the whole app, fonts included, in one HTML
file that runs from anywhere.
