# Invoicing without outside services

Goal: a workspace issues an invoice, sends it, reminds and sees the payment come in, all inside CLinks and with no
new provider. What needs a contract with someone else (insurer billing via MediData, eBill, a live bank connection)
stays out and is listed at the end. Planned with the owner on 26.11.2026. Not legal advice: the legal points below
are what the plan assumes and should be checked by a fiduciary or lawyer before go-live.

## Today

Invoices with lines and VAT, numbers assigned by the server, Swiss QR payment part without reference (`NON`), print
through the browser, payments and reminder level entered by hand. «Per Mail senden» only opens a draft in the
internal mail module, which sends nothing outside.

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

- [ ] Settings › Rechnungen: IBAN (exists), optional QR-IBAN (checked by its IID 30000–31999), payment term in days,
      footer text, VAT number shown when set.
- [ ] Reference per invoice, fixed at issue: QR reference (26 digits + mod 10) with a QR-IBAN, else SCOR
      (`RF` + mod 97) with the IBAN; derived from the invoice number so it is unique per workspace.
- [ ] QR payload with `QRR`/`SCOR`; the reference also printed on the receipt and payment part.
- [ ] Service date or period on the invoice (from the appointments it bills, editable).
- [ ] Unit tests for both check digits and the payload against the examples of the SIX implementation guide 2.4.

### 2 · PDF/A from the server and the archive

- [ ] The API renders the invoice as PDF/A-2b (embedded fonts, colour profile, metadata) with the QR part to scale;
      the same layout as the screen.
- [ ] Rendered once when the invoice is issued, stored in the workspace's bucket with object lock, its SHA-256 and
      time kept on the invoice; issued invoices cannot be edited, corrections go by credit note and a new invoice.
- [ ] Download and print use the stored file; CI checks the output with veraPDF (open source, runs locally).

### 3 · Sending

- [ ] «Senden» on an issued invoice: e-mail through the existing mail server, sender name of the workspace, replies
      go to the workspace's address.
- [ ] Two ways, chosen per workspace and changeable per invoice:
  - **Attachment**: the PDF in the mail. Default for workspaces without Physio or Spitex.
  - **Secure link**: the mail holds no health data, only a link to the invoice that expires after 90 days and
    asks for the recipient's postcode before showing it. Default with Physio or Spitex.
- [ ] Sent invoices keep a log entry (when, to whom, which way); link openings are logged, no tracking pixels.
- [ ] Print and post stay possible for recipients without e-mail.
- [ ] Ops: SPF and DKIM for the sending domain (in `docs/ops/livegang.md`).

### 4 · Reminders

- [ ] Up to three levels per workspace: text, extra days, optional fee; default interest only if switched on.
- [ ] «Mahnen» renders a reminder PDF with a new QR part for the open amount plus fee, archived like the invoice,
      and sends it the same way.
- [ ] The finance overview lists invoices due for a reminder; nothing goes out without a click.

### 5 · Payments from the bank file

- [ ] Upload camt.054 (and camt.053) from e-banking; the API reads it, matches each credit by its QR or SCOR
      reference, and books full or partial payments.
- [ ] Credits without a match are listed with suggestions (amount and name) to assign by hand.
- [ ] Importing the same file twice books nothing twice (bank entry reference); the file is archived as an
      accounting record with its hash.
- [ ] Audit entries for every import and every booked payment.

### 6 · Before go-live

- [ ] Check sample bills with the SIX QR-bill validator (test tool only).
- [ ] Have the invoice template, the secure-link texts and reminder texts checked (fiduciary or lawyer).
- [ ] e2e: issue → send by link → open → import a camt.054 → paid; reminder level 1 with fee.

## Out of scope (needs an outside party)

- Billing insurers (generalInvoice XML via an intermediary such as MediData, tariff catalogues).
- eBill (registration as biller with SIX).
- Fetching bank files automatically (bank interface, e.g. bLink).
