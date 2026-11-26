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

- [ ] `products.ts` with the catalogue; `moduleBooked`, navigation and plan checks read it.
- [ ] Roles page grouped: «Grundfunktionen», one section per booked product, «Verwaltung» (team, roles, billing,
      settings, audit). Plain labels per right: «Sehen», «Bearbeiten», and special rights such as «Woche freigeben» or
      «Nur eigene Einsätze» with one line of explanation.
- [ ] Rights of unbooked products are not shown; a role that still holds them shows «ruht, Spitex nicht gebucht».
- [ ] Team list and invitation show the role with its products («Spitex-Pflege · Spitex»).

### 2 · Role templates per product

- [ ] Templates for Spitex (Leitung, Planung, Pflege – eigene Einsätze) and Physio (Leitung, Therapie, Empfang).
- [ ] Created on first booking, «Auf Vorlage zurücksetzen», hidden and not assignable while the product is off.
- [ ] Migration: the Spitex demo's «Spitex-Mitarbeitende» becomes the Pflege template.

### 3 · Booking add-ons

- [ ] Stripe: one product and price per add-on in CHF; Checkout and Customer Portal add or remove the subscription item.
- [ ] Webhook sets the tenant's add-ons and recomputes `enabled_modules`; idempotent like today.
- [ ] Settings › Abo: base plan plus add-on cards («Spitex buchen», «Abbestellen» with what happens to the data).
- [ ] Super administrator: grant a product to a tenant with optional end date; shown to the owner as «Freigeschaltet
      bis …».
- [ ] Migration: `business` tenants keep Spitex and Physio as grants until they choose.

### 4 · Hiding and dormant data

- [ ] Search, command palette, dashboard widgets, contact page sections and notifications check product + right.
- [ ] Direct link without right: «Kein Zugriff» page with who to ask (team managers).
- [ ] Contact page: care and therapy sections only with `spitex.read` / `physio.read`; the contact itself stays shared.
- [ ] Cancelled product: data kept, export in Settings › Datenschutz, booking again restores roles and data.

### 5 · Tests

- [ ] Integration: a right of an unbooked product grants nothing in the API, RLS and sync streams.
- [ ] e2e: Home-Care24 books Spitex, a nurse with the Pflege template sees only «Meine Einsätze», Physio stays hidden.

## Open

- Price model of the add-ons: per seat like the base plan, or a flat monthly fee per workspace?
- Do the plan tiers stay (Starter, Team, Business) or does the base become one plan with tasks, mail and finance as
  add-ons too?
- Trial: a free Spitex month on first booking?
