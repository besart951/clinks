# Mail: senders, business mail, newsletter and reminders

Goal: a workspace sends business mail (invoices, reminders, appointments), personal one-to-one mail and newsletters
from its own addresses, sees replies at the contact, and stays deliverable and lawful. Planned with the owner on
27.11.2026, decisions below. Written so the whole plan can be built in one go, phase by phase, one PR per phase. Not
legal advice: the legal points are what the plan assumes and should be checked before go-live.

## Decisions (owner, 27.11.2026)

| Topic                   | Decision                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Sending from own domain | SMTP relay of an EU provider; CLinks holds one DKIM key per domain and signs itself, so the provider can be swapped |
| Newsletter              | Now, complete: double opt-in form, consent on the contact, one-click unsubscribe, suppression list, own subdomain   |
| Incoming mail           | Filing address per workspace (BCC or forward); mails land at the matching contact. No mailbox sync (M365/Google)    |
| Appointment reminders   | Mail now; an SMS interface is prepared, the provider follows later                                                  |

## Today

- One SMTP account (`SMTP_URL`, `MAIL_FROM`, Infomaniak in production, Mailpit locally) sends sign-in codes,
  invitations, plan notices and, since the invoicing plan, invoices and reminders: from `no-reply@clinks.ch` with the
  workspace's name as display name and `Reply-To` from Settings › Rechnungen. Sending happens inside the request
  (`services/invoices.ts deliver`); there is no queue, no retry and no bounce handling.
- The mail module (inbox, sent, drafts, archive, templates, campaigns with draft → review → approved → scheduled →
  sent) is internal only: nothing leaves CLinks, nothing comes in. Campaign `stats` exist but nothing fills them.
- Contacts have one `email`, `tags` and no consent fields. Users have notification preferences, no signature.

## Legal and technical frame

| Topic                  | What applies                                                                                                                     | What CLinks does                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Mass advertising mail  | UWG Art. 3 Abs. 1 lit. o: prior consent, or existing customers for similar offers, always with a simple opt-out; correct sender  | Newsletter only to contacts with recorded consent; sender = workspace; unsubscribe in every mail           |
| Proof of consent       | nDSG: lawful, transparent, proportionate; the workspace must be able to show consent                                             | Double opt-in; consent stored with date, source, IP hash and the confirmed text                            |
| Health data            | That someone is a patient is itself health data (nDSG Art. 5 lit. c); professional secrecy (StGB 321)                            | No automatic audience from patient status; reminders name only workspace, date and time, never the service |
| Processor and transfer | nDSG Art. 9 (processor agreement), Art. 16 (EU counts as adequate)                                                               | Relay provider in the EU/CH, processor agreement listed as go-live step                                    |
| Bulk sender rules      | Gmail/Yahoo (since 2024): SPF and DKIM, DMARC aligned with the From domain, one-click unsubscribe (RFC 8058), low complaint rate | Domain check before use; `List-Unsubscribe` + `List-Unsubscribe-Post`; newsletter on its own subdomain     |
| Reputation             | Complaints about newsletters must not hurt invoices                                                                              | Separate sender domains per purpose, suppression list per workspace, throttling                            |
| Tracking               | Open and click tracking needs a basis and is unpopular                                                                           | No tracking pixels and no link rewriting; stats are recipients, delivered, bounced, unsubscribed           |

## Architecture

```
API request ─┐                            ┌─ MailTransport ── relay (prod) / Mailpit (dev)
             ├─► mail_outbox (same tx) ──►│   signs DKIM per sender domain, sets Return-Path for bounces
worker tick ─┘   claim → send → status    └─ SmsTransport ─── none (prepared)

InboundSource (IMAP prod / Mailpit API dev) ──► InboundRouter ──► filing address → mails (inbox) at the contact
                                                                 bounce address  → outbox status + suppression
```

- **Outbox**: every mail of a workspace is written to `mail_outbox` in the transaction that causes it; a worker in the
  API process sends it. Sign-in codes and invitations stay direct (latency, no workspace).
- **Worker**: `MailWorker` ticks every 5 s when `MAIL_WORKER=on` (one instance in production). It claims rows through
  `claim_mail_outbox(limit)` (SECURITY DEFINER, `FOR UPDATE SKIP LOCKED`, returns id and tenant), then sends each in
  `inScope(tenant)`. Retries with backoff (1 min, 5 min, 30 min, 2 h, 6 h), then `failed`. Throttle per workspace and
  globally from config (`MAIL_RATE_PER_SECOND`, default 5). The same tick schedules due campaigns, due appointment
  reminders and polls the inbound source.
- **Transport**: `MailTransport.send(message, signing)`; `relayTransport(SMTP_RELAY_URL)` uses nodemailer with
  `dkim: { domainName, keySelector, privateKey }` from the sender's domain. Without a verified domain the platform
  sender (`MAIL_FROM`) is used, as today. `MemoryTransport` for tests.
- **Return-Path (VERP)**: `b-<outbox id short>@in.clinks.ch`; bounces come back through the inbound source and mark
  the row `bounced` and suppress the address after a hard bounce (5.x.x) or three soft ones.
- **Inbound**: one catch-all mailbox on `in.clinks.ch` (`INBOUND_IMAP_URL`), read with `imapflow`; locally the
  Mailpit REST API. Each workspace has a random filing address `ablage-<10 chars>@in.clinks.ch`.
- **HTML layout**: one accessible template (logo, brand colour, 600 px, system fonts, dark-mode safe colours, text
  alternative always included), signature block, footer with the workspace's address; newsletters add the unsubscribe
  line. Built in `@clinks/mail-layout` (pure functions, used by API and demo).
- **Demo (mock)**: the same rules in the browser: outbox rows are «sent» at once into Mail › Gesendet, public pages
  (opt-in, confirm, unsubscribe) work locally, the filing address accepts a pasted `.eml` for testing.

## Data model (migrations 0022 ff.)

| Table (schema)                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mail_domains`                   | Domain, purpose (`business` / `newsletter`), status (`pending` / `verified` / `failing`), DKIM selector and public key, last check and its result per record                                                                                                                                                                                                                                   |
| `auth.mail_domain_keys`          | DKIM private key per domain, encrypted with `SecretBox` (never synced, never exported)                                                                                                                                                                                                                                                                                                         |
| `mail_senders`                   | Address, display name, kind (`business` / `personal` / `newsletter`), `user_id` for personal ones, reply-to, default flag per kind; address must be on a verified domain of the right purpose                                                                                                                                                                                                  |
| `mail_outbox`                    | Tenant, kind (`invoice` / `reminder` / `appointment` / `personal` / `campaign` / `optin` / `system`), sender, to, subject, text, html, attachments (document ids), headers, links (contact, invoice send, campaign, mail row), status (`queued` / `sent` / `bounced` / `failed` / `suppressed`), attempts, error, message id (`<outbox id@clinks.ch>`); due time and lock in `auth.mail_queue` |
| `mail_suppressions`              | Tenant, address (lower case), reason (`unsubscribed` / `bounced` / `complaint` / `manual`), scope (`newsletter` / `all`), since                                                                                                                                                                                                                                                                |
| `mail_inbound_addresses`         | Tenant, local part of the filing address, active                                                                                                                                                                                                                                                                                                                                               |
| `newsletter_forms`               | Tenant, public token, title, intro, tags given on sign-up, consent text, active                                                                                                                                                                                                                                                                                                                |
| `newsletter_consents`            | Tenant, contact, status (`pending` / `subscribed` / `unsubscribed`), source (`form` / `manual` / `import`), consent text, confirmed at, IP hash, unsubscribe token hash                                                                                                                                                                                                                        |
| `contacts` (synced, new cols)    | `newsletter` (server-set: `none` / `pending` / `subscribed` / `unsubscribed`), `reminders` (bool, default true), `mobile`                                                                                                                                                                                                                                                                      |
| `users` (new col)                | `mail_signature` (plain text, max 1000)                                                                                                                                                                                                                                                                                                                                                        |
| `appointments` (synced, new col) | `reminded_at`, `confirmed_mail_at` (server-set)                                                                                                                                                                                                                                                                                                                                                |
| `invoice_sends` (new cols)       | `outbox_id`, `delivery` (`queued` / `sent` / `bounced` / `failed`) so the invoice log shows delivery                                                                                                                                                                                                                                                                                           |
| `tenants.mail_settings` (jsonb)  | `appointmentConfirmation`, `appointmentReminder` (`hoursBefore`, text), `smsEnabled` (false), defaults per kind                                                                                                                                                                                                                                                                                |

All tenant tables with RLS like the others; `mail_outbox` and `newsletter_consents` are not synced (REST), the send
state the UI needs comes through REST.

## Phases

### 1 · Outbox, transport and layout

- [x] `mail_outbox` (RLS) and `auth.mail_queue` (ids across workspaces, never published); `MailWorker` claims due rows
      with `FOR UPDATE SKIP LOCKED`, sends each in its workspace's scope, retries temporary failures after 1, 5, 30,
      120 and 360 minutes, ends on a permanent refusal (5xx) or a mismatching archived file; `MAIL_WORKER` and
      `MAIL_RATE_PER_SECOND` in config and the env examples. The relay (`SMTP_RELAY_URL`) and its `ops:check` come
      with the sender domains in phase 2.
- [x] `@clinks/mail-layout` renders HTML + text from a typed model (paragraphs, buttons, signature, footer,
      unsubscribe); button text switches to dark on light brand colours (WCAG contrast).
- [x] Invoices and reminders go through the outbox in the transaction that logs them; attachments are read when
      sending and checked against the archive's SHA-256. The send log shows «Wird gesendet …», «Unzustellbar» or
      «Nicht gesendet» and follows the outbox for half a minute. Invoice mail code split into `invoice-mail.ts`
      (context, composition) and `invoice-links.ts` (recipient side); permission scope shared (`withPermission`).
- [x] Plan notices go through the outbox in the upload's transaction (kind `system`, platform sender); the
      after-commit sending is gone.
- [x] Tests: layout (escaping, text form, contrast), outbox (layout and message id, retry and backoff, permanent
      failure, two workers, checksum), invoice mails without health data and with the link button.

### 2 · Domains and senders

- [x] Settings › E-Mail (`settings.manage`): add a domain and its purpose; CLinks creates the DKIM key (RSA 2048,
      selector `clinks-<6 hex>`, private half sealed with `SecretBox` in `auth.mail_domain_keys`) and shows the TXT
      records with copy buttons: SPF `include:` of `MAIL_SPF_INCLUDE` (default `_spf.clinks.ch`, which CLinks points
      at the relay), DKIM on `<selector>._domainkey`, DMARC `p=none` to start.
- [x] «Prüfen» resolves the records (resolver injected in tests) and shows each as found / missing with what DNS
      answered; before sending, the worker re-checks a domain verified more than 24 h ago and on failure marks it
      `failing`, notifies admins in the app and sends from the platform address instead.
- [x] Senders: business (default one used by invoices and reminders), personal (per member), newsletter (only on a
      newsletter domain). Reply-to per sender; without a business sender invoices keep using «Antworten an».
- [x] Personal signature in the profile; business signature per sender, appended by the outbox.
- [x] `SMTP_RELAY_URL`, `MAIL_SPF_INCLUDE` in config and env examples; `ops:check` checks the relay login and the
      SPF collection record. Demo: «Prüfen» takes the records as published.
- [x] Tests: DNS judgement (missing, wrong, existing SPF with the include), records, DKIM key pair matches the
      published key, invoice via relay from the sender with signature, fallback and admin notice when failing,
      domain removal only without senders; e2e: domain → check → sender → invoice from it.

### 3 · Inbound: filing address and bounces

- [ ] `InboundSource` (IMAP via `imapflow`, Mailpit API in dev/test), `InboundRouter`: filing address → parse with
      `mailparser` → `mails` row in `inbox` at the contact whose address matches From (or To for forwarded sent
      mail, then folder `sent`); attachments become documents (size limit as uploads); unknown sender → inbox without
      contact. Bounce address → outbox `bounced`, suppression after a hard bounce.
- [ ] Settings › E-Mail shows the filing address with copy button and a short how-to (BCC on outgoing mail,
      forwarding rule for incoming); «Neue Adresse» rotates it.
- [ ] Contact page: mail timeline (sent through CLinks, filed, invoices/reminders/newsletters with delivery state).
- [ ] Guards: max 10 MB per message, only `in.clinks.ch` recipients, mails older than 30 days in the mailbox are
      deleted after processing, no auto-replies to inbound mail (loop guard: `Auto-Submitted`, `Precedence`).
- [ ] Tests: routing (filed, forwarded, unknown, bounce hard/soft), attachment to document, loop guard.

### 4 · The mail module sends for real

- [ ] Compose: choose sender (personal or business the role may use), to/cc to contacts or addresses, template with
      placeholders (`{{vorname}}`, `{{nachname}}`, `{{firma}}`, `{{arbeitsbereich}}`), attachments from documents;
      «Senden» enqueues, the mail appears in Gesendet with its delivery state.
- [ ] Drafts stay internal; replies (`Antworten`) from a filed inbound mail set `In-Reply-To`/`References`.
- [ ] Permissions: `mail.write` sends from the own personal sender; using a business sender needs `mail.business`
      (new, in the role templates for admin and office); audit `mail.sent`.
- [ ] Limits per workspace and day (config per plan, e.g. 500 personal/business mails) with a clear error.
- [ ] Tests: placeholders, permission matrix, limit, suppressed addresses (scope `all`) refused with a message.

### 5 · Newsletter

- [ ] Consent: contact page shows newsletter status with history; «Einwilligung erfassen» (manual, source and note
      required) and «Abmelden»; import of a CSV of consents with source `import`.
- [ ] Sign-up form: public page `#/newsletter/<form token>` (name, e-mail, consent text, honeypot, rate limit per
      IP) → confirmation mail (kind `optin`) → `#/newsletter/confirm/<token>` sets `subscribed` and adds the tags;
      unconfirmed requests expire after 7 days and are deleted. Embeddable link and QR code for the practice.
- [ ] Unsubscribe: `#/unsubscribe/<token>` page (one click, then optional reason), `List-Unsubscribe` with the
      HTTPS link and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` to `POST /mail/unsubscribe/<token>` on the
      API; both suppress scope `newsletter` and set the contact `unsubscribed`.
- [ ] Campaigns: audience = tag ∩ `subscribed` − suppressed, shown as a count before approval; the existing review →
      approve flow requires a second person when the workspace has more than one `mail.write` member; «Planen» at a
      time or «Jetzt senden»; the worker expands the audience at send time into outbox rows (throttled), then fills
      `stats` with recipients, sent, bounced, unsubscribed (opens and clicks are dropped from the UI). Test mail to
      oneself. Physio/Spitex: a notice that patient status is health data and only consenting contacts are reached.
- [ ] Tests: double opt-in round trip, expiry, unsubscribe via page and RFC 8058 POST, audience arithmetic,
      approval rule, headers present, no tracking pixel or rewritten links in the HTML.

### 6 · Appointment confirmations and reminders

- [ ] Settings › E-Mail › Termine: confirmation on create/move (on/off), reminder N hours before (default 24, off by
      default), own text; per contact «Erinnerungen» on/off and the contact's language.
- [ ] Worker schedules: appointments with a contact e-mail, not cancelled, start in the window, `reminded_at` empty →
      outbox (business sender) → `reminded_at`. Moving an appointment resets it. Content: workspace, date, time,
      address of the practice, «Termin absagen? Antworten Sie auf diese Mail» — never service, therapist notes or
      diagnosis. Spitex visits only for clients who opted in (arrival window instead of a time).
- [ ] `SmsTransport` interface with `none`; `contacts.mobile`; channel choice is shown disabled («SMS folgt»).
- [ ] Tests: window and timezone (Europe/Zurich, DST), move resets, cancelled skipped, opted-out skipped, content
      contains no service.

### 7 · Go-live check

- [ ] e2e on the demo: domain setup screen, compose and send, filing (pasted .eml), newsletter sign-up → confirm →
      campaign → unsubscribe, reminder appears in Gesendet. e2e against the API with Mailpit: invoice through the
      outbox with delivery state, newsletter double opt-in and RFC 8058 unsubscribe, a bounce marks the row.
- [ ] Side effects: data export (consents, senders, outbox without bodies older than 90 days, suppressions), account
      deletion (personal sender and signature removed), role templates, search, notifications, Flutter OpenAPI.
- [ ] Retention: outbox bodies deleted after 90 days (metadata kept 2 years for proof), inbound raw messages not kept.
- [ ] Ops (`docs/ops/livegang.md`): relay account and processor agreement, SPF/DKIM/DMARC for `clinks.ch`,
      `in.clinks.ch` MX and catch-all mailbox, `MAIL_WORKER` on exactly one instance, alert on `failed` > 1 % per hour.
- [ ] Owner: choose the relay provider (EU/CH, SMTP relay allowing own DKIM per customer domain, bounce via
      Return-Path) and the per-plan mail limits; have consent and reminder texts checked.

## Out of scope (later)

- Mailbox sync with Microsoft 365, Google or IMAP per person (needs app approvals and OAuth review).
- SMS provider (interface ready), WhatsApp.
- Open/click tracking, A/B tests, automations (drip campaigns), dedicated IP.
- Online booking for clients (fits the reminders; own plan).
