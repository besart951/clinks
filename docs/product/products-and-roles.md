# Products, roles and rights

How a customer such as Home-Care24 books Spitex or Physio, which basic functions come with it, and how a role decides
what a person sees. Decided with the owner on 26.11.2026.

## Decisions

| Question                 | Decision                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| How products are bought  | A base plan by seats, Spitex and Physio as add-ons booked separately                                                      |
| Basic functions          | Contacts, calendar and documents always; tasks, mail and finance with the plan or as add-ons; feature flags stay for beta |
| Access to a product      | Through the role: one person, one role, rights grouped by product                                                         |
| Product without rights   | Hidden everywhere (navigation, search, commands, dashboard); a direct link shows «Kein Zugriff»                           |
| Roles for a product      | Templates per product (e.g. Spitex-Leitung, Spitex-Planung, Spitex-Pflege), editable, shown only while it is booked       |
| Contacts across products | One shared contact base; care and therapy data only with the product's right                                              |
| Product cancelled        | Hidden for everyone, rights in roles stay dormant, data kept and exportable; booking again restores everything            |
| Who books                | The owner in Settings › Abo via Stripe; the super administrator can grant a product without payment (pilot, trial)        |

## Model

- **Product catalogue** in `@clinks/domain/products`: each product (`core`, `planner`, `mail`, `finance`, `spitex`,
  `physio`) names its modules, its permissions, its role templates and whether it is always included, part of a plan or
  an add-on. Navigation, the role page, sync rules and billing read this one list instead of spreading module lists.
- **Entitlements** of a tenant = plan modules ∪ booked add-ons ∪ grants (super administrator, optional end date).
  `enabled_modules` stays the single column PowerSync and RLS read; the API recomputes it whenever plan, add-on or grant
  changes.
- **Rights** stay flat strings (`spitex.read`, `spitex.release` …) so RLS and sync streams keep working; grouping is
  presentation. A right whose product is not booked grants nothing (`roleGrants` with the tenant's entitlements).
- **Role templates** are roles with `kind = 'template'` and a `product`; created when the product is first booked, can
  be edited and reset to the template, hidden and unassignable while the product is off. Custom roles may mix products.

## Phases

### 1 · Catalogue and grouped role page

- [x] `products.ts` with the catalogue (products, rights, templates); the role page, templates and role checks read
      it. Navigation and billing move onto it in phase 3.
- [x] Roles page grouped: «Grundfunktionen», one section per booked product, «Verwaltung» (team, roles, billing,
      settings, audit). Plain labels per right: «Sehen», «Bearbeiten», and special rights such as «Woche freigeben» or
      «Nur eigene Einsätze» with one line of explanation.
- [x] Rights of unbooked products are not shown; a role that still holds them shows «ruht, Spitex nicht gebucht».
- [x] Team list and invitation offer only roles that can be given; a template role of an unbooked product stays
      with whoever already has it.

### 2 · Role templates per product

- [x] Templates for Spitex (Leitung, Planung, Pflege – eigene Einsätze) and Physio (Leitung, Therapie, Empfang).
- [x] Created on first booking, «Auf Vorlage zurücksetzen», hidden and not assignable while the product is off.
- [x] Migration `0016_role_templates` adds the templates to workspaces that have Spitex or Physio; the demo's
      «Spitex-Mitarbeitende» became the Pflege template. `POST /tenant/roles/{id}/reset`; a template role of an
      unbooked product answers 409 on invite and role change.

### 3 · Booking add-ons

- [ ] Stripe: one product and price per add-on in CHF; Checkout and Customer Portal add or remove the subscription item.
- [ ] Webhook sets the tenant's add-ons and recomputes `enabled_modules`; idempotent like today.
- [ ] Settings › Abo: base plan plus add-on cards («Spitex buchen», «Abbestellen» with what happens to the data).
- [ ] Super administrator: grant a product to a tenant with optional end date; shown to the owner as «Freigeschaltet
      bis …».
- [ ] Migration: `business` tenants keep Spitex and Physio as grants until they choose.

### 4 · Hiding and dormant data

- [x] Navigation (sidebar and phone bar) shows only places the person may open; an unbooked product appears as
      «locked» only to those who may book it (`billing.manage`), for everyone else it is hidden.
- [x] Search (⌘K) lists a booked area without the right as «Kein Zugriff», not selectable; unbooked areas only for
      those who may book them («Nicht gebucht»); create actions need the write right. The palette now loads its
      entries however it is opened (shortcut, button).
- [x] Direct link without right: «Kein Zugriff» (`ModuleGate`); dashboard widgets already check product + right.
- [x] Contact page: the buttons to the Physio record and the Spitex client need `physio.read` / `spitex.read`.
- [ ] Cancelled product: data kept, export in Settings › Datenschutz, booking again restores roles and data.

### 5 · Tests

- [ ] Integration: a right of an unbooked product grants nothing in the API, RLS and sync streams.
- [ ] e2e: Home-Care24 books Spitex, a nurse with the Pflege template sees only «Meine Einsätze», Physio stays hidden.

## Pricing proposal (research 26.11.2026, to confirm)

Swiss competitors, as published:

| Product    | Price                                                                      | What it covers                                           |
| ---------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| CuraSoft   | CHF 250 (≤ 10 clients), 350 (≤ 30), 700 (≤ 50), 1000 (≤ 100) per month     | Spitex: planning, clients, KVG billing, MediData         |
| NURSANA    | CHF 199 per month freelance, organisations from CHF 499; interRAI extra    | Spitex: care planning, dispatch, KLV billing, accounting |
| All-in-one | about CHF 50–100 per user and month (job.rocks comparison)                 | Spitex suites with planning, mobile app, billing         |
| phyzio.ch  | CHF 60 per month incl. one physio, CHF 20 per further physio, −10 % yearly | Physio: agenda, records, KVG/UVG billing, MediData       |
| Physitrack | CHF 74.99 per therapist, CHF 27.99 per assistant per month                 | Physio: records, exercise programs; Swiss billing open   |

CLinks has no insurance billing (KLV/MediData, Tarif 312) and no interRAI yet. The owner wants to be clearly the
cheapest, so the proposal sits far below (revised 26.11.2026):

| Part                       | Proposal                                                       |
| -------------------------- | -------------------------------------------------------------- |
| Base (basics, tasks, mail) | CHF 9 per full user and month                                  |
| Finance                    | included in the base                                           |
| Spitex add-on              | CHF 19 per workspace + CHF 2 per care user («eigene Einsätze») |
| Physio add-on              | CHF 15 per workspace (therapists are full users)               |
| Yearly                     | two months free (as today)                                     |
| Trial                      | 30 days, no card                                               |

Examples: freelance nurse CHF 28 (NURSANA 199, CuraSoft 250); Spitex with 2 planners and 10 care staff CHF 57
(CuraSoft from 250); physio with 1 therapist CHF 24, with 3 therapists CHF 42 (phyzio.ch 60 / 100). Stripe keeps about
2.9 % + CHF 0.30 per payment, so the smallest invoice still leaves about CHF 23. Insurance billing later as its own
add-on.

## Open

- Price model of the add-ons: per seat like the base plan, or a flat monthly fee per workspace?
- Do the plan tiers stay (Starter, Team, Business) or does the base become one plan with tasks, mail and finance as
  add-ons too?
- Trial: a free Spitex month on first booking?
