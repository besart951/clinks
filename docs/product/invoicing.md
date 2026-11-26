# Invoicing without outside services

Goal: a workspace issues an invoice, sends it, reminds and sees the payment come in, all inside CLinks and with no
new provider. What needs a contract with someone else (insurer billing via MediData, eBill, a live bank connection)
stays out and is listed at the end. Planned with the owner on 26.11.2026. Not legal advice: the legal points below
are what the plan assumes and should be checked by a fiduciary or lawyer before go-live.

## Today

Before this plan: invoices with lines and VAT, numbers assigned by the server, Swiss QR payment part without reference
(`NON`), print through the browser, payments and reminder level entered by hand. «Per Mail senden» only opened a draft
in the internal mail module, which sent nothing outside.

## Legal frame (Switzerland)

| Topic            | What applies                                                                                                       | What CLinks does                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Invoice content  | Art. 26 MWSTG: provider and recipient identifiable, kind of service, date or period, amount, VAT rate and number   | Add the service date or period; VAT number of the workspace on every invoice          |
| Retention        | Art. 958f OR: 10 years; GeBüV Art. 9: electronic storage must be unalterable or its integrity secured, time proven | PDF/A stored once in the bucket with object lock, SHA-256 kept, no edit after issue   |
| QR reference     | SIX: QR reference only with a QR-IBAN from the bank; Creditor Reference (SCOR, ISO 11649) with a normal IBAN       | Workspace enters its IBAN and optionally its QR-IBAN; CLinks picks the reference type |
| Health data      | Health data are especially sensitive (nDSG); physio and Spitex staff are bound by professional secrecy (StGB 321)  | Physio and Spitex invoices go out as a secure link by default, not as an attachment   |
| Bank files       | camt.054 holds payer names and accounts: personal data, processed only to match payments                           | Keep matched fields and the file as accounting record; no other use                   |
| Default interest | OR: 5 % after a reminder unless agreed otherwise; reminder fees only if agreed with the customer                   | Fees and interest are off by default and set per workspace                            |

## Phases

### 1 · Payment details and references

- [x] Settings › Rechnungen: IBAN (exists), optional QR-IBAN (checked by its IID 30000–31999), payment term in days,
      footer text, VAT number shown when set.
- [x] Reference per invoice, fixed at issue: QR reference (26 digits + mod 10) with a QR-IBAN, else SCOR
      (`RF` + mod 97) with the IBAN; derived from the invoice number so it is unique per workspace (`paymentDetails` in
      `@clinks/domain/qr-bill`; not stored, phase 2 archives the PDF with it).
- [x] QR payload with `QRR`/`SCOR`; the reference also printed on the receipt and payment part.
- [x] Service date or period on the invoice (from the appointments it bills, editable).
- [x] Unit tests for both check digits and the payload against the examples of the SIX implementation guide 2.4.

### 2 · PDF/A from the server and the archive

- [x] `@clinks/invoice-pdf` renders invoice and reminder as PDF/A-2b (Liberation Sans embedded as the SIX style guide
      allows, sRGB output intent, XMP metadata, file identifier) with the QR part to scale (46 mm code, Swiss cross);
      the same code runs in the API and in the demo.
- [x] Rendered once when the invoice is issued, in the same transaction as the write (`InvoiceArchive`), stored as a
      locked document in «Rechnungen» in the workspace's bucket (object lock) with its SHA-256 on the invoice. The
      database refuses changes to what an issued invoice bills, deleting it, and renaming, replacing or deleting the
      file; filing it elsewhere or linking a contact still works.
- [x] `GET /finance/invoices/{id}/pdf` for anyone with `finance.read`; the invoice page downloads the archived file.
- [x] Tests: structure (embedded fonts, metadata, intent), page breaks with the QR part on the last page, QR payload
      read back from the rendered page. veraPDF runs before go-live (phase 6): the sandbox cannot fetch it.

### 3 · Sending

- [x] «Senden» on an issued invoice: e-mail through the existing mail server, display name of the workspace, replies
      go to the workspace's reply address (Settings › Rechnungen › «Antworten an») or else to the person who sends.
- [x] Two ways, chosen per workspace and changeable per invoice:
  - **Attachment**: the archived PDF in the mail (checked against its SHA-256 first). Default for workspaces
    without Physio or Spitex.
  - **Secure link**: the mail holds no amount and no service, only a link to `#/invoice-link/…` that expires after
    90 days and asks for the postcode of the billing address; five wrong postcodes end it. Default with Physio or
    Spitex. The token is stored hashed (`auth.one_time_tokens`, purpose `invoice_link`).
- [x] Sent invoices keep a log entry (`invoice_sends`: when, to whom, which way, by whom) and an audit entry; link
      openings are counted on the log, no tracking pixels. The demo files the mail under Mail › Gesendet and offers
      the link in the log.
- [x] Print and post stay possible for recipients without e-mail (PDF download).
- [x] Ops: SPF, DKIM and DMARC for the sending domain (in `docs/ops/livegang.md`).

### 4 · Reminders

- [x] Up to three levels per workspace (Settings › Mahnwesen): days to pay, optional fee, own text; default interest
      only if switched on, then stated on the reminder (5 % from its date, Art. 104 OR).
- [x] «n. Mahnung senden» renders a reminder PDF/A with a new QR part for the open amount, earlier fees and its own
      fee, archived locked like the invoice, and sends it the same two ways (`POST /finance/invoices/{id}/remind`).
      The invoice keeps `reminders` (level, date, deadline, fee, document) and the level; both are set by the server
      only, and the list can only grow. Fees count towards the open balance, without VAT.
- [x] A level is due the day after the invoice's or the previous reminder's deadline. The finance overview names how
      many invoices are due and filters them; nothing goes out without a click.
- [x] Invoices issued before the archive existed are archived when they are first sent.

### 5 · Payments from the bank file

- [ ] Upload camt.054 (and camt.053) from e-banking; the API reads it, matches each credit by its QR or SCOR
      reference, and books full or partial payments.
- [ ] Credits without a match are listed with suggestions (amount and name) to assign by hand.
- [ ] Importing the same file twice books nothing twice (bank entry reference); the file is archived as an
      accounting record with its hash.
- [ ] Audit entries for every import and every booked payment.

### 6 · Before go-live

- [ ] Check sample bills with the SIX QR-bill validator (test tool only) and the PDF/A output with veraPDF.
- [ ] Have the invoice template, the secure-link texts and reminder texts checked (fiduciary or lawyer).
- [ ] e2e: issue → send by link → open → import a camt.054 → paid; reminder level 1 with fee.

## Out of scope (needs an outside party)

- Billing insurers (generalInvoice XML via an intermediary such as MediData, tariff catalogues).
- eBill (registration as biller with SIX).
- Fetching bank files automatically (bank interface, e.g. bLink).
