# Product backlog

Product-level wishlist from the "Todo" planning doc (21.11.2026, original:
[Todo](https://claude.ai/artifact/QquHHwSfDEwM924Pi6rUj4)). The engineering order lives in [`../plan.md`](../plan.md);
this file says _what_ the product needs, the plan says _when_ it is built.

## 1. Platform & account

- Tenants (org/workspace), invitations, roles per module
- Subscription & billing: plans, trial, Stripe, module activation
- Onboarding: create org, demo data, checklist
- Settings: company, logo, language, notifications

## 2. Shared building blocks across all modules

- Contacts/CRM as one customer base for every module
- Calendar/appointments (Physio, Spitex, deadlines)
- Documents/file storage
- Global search + Cmd-K
- Notifications (in-app, mail, push)
- Activity and audit log

## 3. Client-first

- Local cache + sync with conflict rules (done for contacts and appointments via PowerSync, phase 3)
- PWA: installable, offline, push
- Optimistic updates, clean loading and error states

## 4. Operations & law (Switzerland)

- revDSG: data export, deletion, data processing agreement, hosting in Switzerland
- Health data: encryption, access logs
- 2FA/SSO, session management
- Backups, monitoring, error tracking
- Admin back office (tenants, support, feature flags)
- Help, changelog, terms and privacy policy

**Order:** tenants + billing → contacts + calendar → notifications + search → offline sync.

## UI prototype without backend — done

Done on 21.11.2026 ([PR #1](https://github.com/besart951/clinks/pull/1)); the prototype is now `apps/web`. Its
checklist covered: foundation (domain types, repository interfaces, mock store with persistence, seed data, fake
latency and failure rate, fake auth with role switcher, central `can(user, action, resource)`, shared UI kit), app
shell and navigation, platform and account screens, shared building blocks (contacts, calendar, documents, search,
notifications, activity log, comments), all modules (MailLink, FinanzLink, PlanerLink, Physio, Spitex), and a quality
pass (loading/empty/error/forbidden states, optimistic updates with undo, form validation, offline banner, responsive
375/768/1280 px, WCAG AA, central translations, Playwright tests).

Definition of done was this path without a backend: sign up → set up org → invite colleague → create contact → book
appointment → issue invoice → send mail → finish task → find everything in the log and in search.

Still open from the prototype and carried into the plan: service worker/PWA, push and a real offline queue.
