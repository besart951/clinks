# Livegang – Schritt für Schritt

Diese Anleitung führt vom leeren Infomaniak-Konto bis zum ersten Pilot-Mandanten. Alles im Code ist fertig und
getestet; was hier steht, braucht deine Konten, Zahlungsmittel und Entscheidungen. Die technischen Details
(englisch) stehen in [infra/production/README.md](../../infra/production/README.md).

**Grundregel:** Nach jedem Block `pnpm ops:check -- --config-dir "$CONFIG_DIR"` laufen lassen. Der Check sagt auf
Deutsch, was fehlt und was zu tun ist. Erst weiter, wenn er für den Block grün ist.

Geschätzter Aufwand: ein bis zwei Tage verteilt auf eine Woche (Wartezeiten bei Support und DNS).

## Übersicht

| #   | Block                              | Du brauchst                       | Ergebnis                                   |
| --- | ---------------------------------- | --------------------------------- | ------------------------------------------ |
| 1   | Konten und Entscheidungen          | Infomaniak-, Stripe-Konto, Domain | Projekt, Rechenzentrum, Aufbewahrungsfrist |
| 2   | Server und Netzwerk                | OpenTofu, SSH-Schlüssel           | Edge-Server mit öffentlicher IP            |
| 3   | Datenbank                          | Antwort des Infomaniak-Supports   | Postgres 18 mit logischer Replikation      |
| 4   | Dokumenten-Speicher                | OpenStack-Zugang                  | Bucket mit Versionierung und Object Lock   |
| 5   | DNS und E-Mail                     | Domain-Verwaltung, Mail-Konto     | vier Hostnamen, Absenderadresse            |
| 6   | Konfiguration und Deployment       | dieses Repo auf dem Server        | laufende App unter https://                |
| 7   | Stripe                             | Stripe-Konto, Bankverbindung      | buchbare Abos in CHF                       |
| 8   | Backups, Wiederherstellung, Alarme | Swiss Backup                      | nächtliches Backup, getestete Rückspielung |
| 9   | Vor echten Patientendaten          | Verträge, Pentest                 | Pilot freigegeben                          |

## 1 · Konten und Entscheidungen

- [ ] **Infomaniak Public Cloud** bestellen (manager.infomaniak.com → Public Cloud → Projekt anlegen). Das Projekt
      liefert OpenStack-Zugangsdaten (`openrc`-Datei herunterladen).
- [ ] **Rechenzentrum wählen**: `dc3-a` (Endpoint `s3.pub1.infomaniak.cloud`) oder `dc4-a` (`s3.pub2…`). Beide in
      der Schweiz; alles im gleichen Rechenzentrum anlegen.
- [ ] **Support-Anfrage zur verwalteten Datenbank** (Database Service) stellen – die Antwort entscheidet Block 3.
      Vorschlag:

      > Wir möchten den Database Service für PostgreSQL 18 nutzen und brauchen dafür: (1) `wal_level=logical`
      > und logische Replikationsslots für PowerSync, (2) ein Login mit `REPLICATION` und `BYPASSRLS` für die
      > Replikation, (3) Point-in-Time-Recovery mit mindestens 14 Tagen. Ist das möglich, und in welchem Tarif?

- [ ] **Aufbewahrungsfrist für Dokumente** festlegen (Object Lock). Für den Pilot reicht `GOVERNANCE` mit z. B. 30
      Tagen. `COMPLIANCE` verhindert Löschen auch für dich selbst – erst wählen, wenn die Fristen pro Dokumenttyp
      juristisch geklärt sind.
- [ ] **Domain**: vier Hostnamen unter derselben Domain vorsehen, z. B. `app.clinks.ch`, `api.clinks.ch`,
      `sync.clinks.ch`, `live.clinks.ch`.

## 2 · Server und Netzwerk

Auf deinem Rechner, im Ordner `infra/production/cloud`:

```sh
source ~/Downloads/PCP-XXXX-openrc.sh        # OpenStack-Zugang aus Block 1
tofu init
tofu plan -var external_network_id=… -var external_network_name=ext-floating1 \
  -var image_id=… -var flavor_id=… -var keypair=… -var admin_cidr="DEINE.IP/32"
tofu apply                                    # erst nach Kontrolle von Kosten und Region
```

- [ ] Image: aktuelles Ubuntu LTS; Flavor: für den Pilot 2 vCPU / 4 GB reichen.
- [ ] `admin_cidr` ist deine eigene IP: nur von dort ist SSH offen. Der Server ist sonst nur über 80/443 erreichbar.
- [ ] Notiere die Ausgabe `edge_address` (öffentliche IP) für Block 5.
- [ ] Auf dem Server Docker mit Compose installieren und das Repo auschecken.
- [ ] Node 26 und pnpm auf dem Server, für Migrationen und `ops:check` (die Datenbank ist nur im privaten Netz
      erreichbar):
      `curl -fsSL https://deb.nodesource.com/setup_26.x | sudo bash - && sudo apt install -y nodejs && sudo corepack enable && pnpm install --frozen-lockfile`

## 3 · Datenbank

**A) Infomaniak bestätigt logische Replikation:** Database Service im gleichen Projekt und privaten Netz anlegen,
PITR einschalten. **B) Sonst:** eine zweite Instanz im privaten Netz mit PostgreSQL 18, `wal_level=logical` und
WAL-Archivierung auf separaten Speicher (Vorgehen in `pitr-drill.sh`).

Dann mit dem Eigentümer-Login (Passwörter mit `openssl rand -base64 24` erzeugen):

```sql
CREATE ROLE clinks_app NOLOGIN;
CREATE ROLE clinks_api LOGIN PASSWORD '…' IN ROLE clinks_app;          -- die API, ohne Superuser/BYPASSRLS
CREATE ROLE clinks_replication LOGIN REPLICATION BYPASSRLS PASSWORD '…'; -- nur für PowerSync
CREATE DATABASE powersync_storage;                                     -- Metadaten von PowerSync
CREATE ROLE powersync LOGIN PASSWORD '…';
ALTER DATABASE powersync_storage OWNER TO powersync;
```

Migrationen vom Server aus (Eigentümer-URL nur für diesen Befehl, nie in eine Datei):

```sh
DATABASE_OWNER_URL='postgres://OWNER:…@db.intern:5432/clinks?sslmode=verify-full' pnpm db:migrate
```

Danach die Leserechte der Replikation (die Tabellen der Publikation, nicht das `auth`-Schema):

```sql
GRANT SELECT ON ALL TABLES IN SCHEMA public TO clinks_replication;
```

- [ ] `ops:check` meldet unter «Datenbank» fünfmal ✓ (Login, Migrationen, Replikation, Publikation, Replikations-Login).

## 4 · Dokumenten-Speicher

```sh
openstack ec2 credentials create     # zweimal: einmal zum Einrichten, einmal für die laufende API
```

Den Bucket mit dem Einrichtungs-Zugang anlegen (setzt Versionierung, Object Lock und CORS für die Web-App):

```sh
cd apps/api
S3_ENDPOINT=https://s3.pub1.infomaniak.cloud S3_BUCKET=clinks-dokumente S3_REGION=dc3-a \
AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… WEB_ORIGIN=https://app.clinks.ch \
S3_LOCK_MODE=GOVERNANCE S3_RETENTION_DAYS=30 node src/init-bucket.ts
```

- [ ] Der zweite Zugang (für `api.env`) darf nur diesen Bucket lesen und schreiben.
- [ ] `ops:check` meldet unter «Dokumenten-Bucket» ✓ für Erreichbarkeit, Versionierung, CORS und Object Lock.

Mandanten können später in den Einstellungen ihren eigenen Bucket verbinden (Infomaniak, Cloudflare R2, S3); dafür
ist nichts weiter einzurichten.

## 5 · DNS und E-Mail

- [ ] Vier A-Einträge auf `edge_address`: `app`, `api`, `sync`, `live`. Caddy holt die Zertifikate selbst, sobald
      DNS stimmt.
- [ ] Infomaniak-Mail: Adresse `no-reply@clinks.ch` anlegen. In `api.env` als
      `SMTP_URL=smtps://no-reply%40clinks.ch:PASSWORT@mail.infomaniak.com:465` (das `@` im Benutzernamen als `%40`).
- [ ] SPF und DKIM für die Domain im Infomaniak-Manager aktivieren, damit Anmeldecodes nicht im Spam landen.
      Rechnungen gehen über dieselbe Adresse hinaus (Anzeigename = Arbeitsbereich, `Reply-To` = dessen Adresse);
      zusätzlich DMARC (`p=quarantine`) setzen, sonst sortieren Gmail und Outlook Rechnungsmails oft aus.
- [ ] Versanddienst (EU/CH, SMTP-Relay, eigene DKIM-Signatur erlaubt) wählen, Auftragsbearbeitungsvertrag
      abschliessen, `SMTP_RELAY_URL` setzen. TXT `_spf.clinks.ch` = `v=spf1 include:<SPF des Dienstes> ~all`
      anlegen: Kundendomains verweisen nur darauf, ein Anbieterwechsel braucht bei ihnen keine Änderung.
- [ ] Sammelpostfach für `in.clinks.ch`: MX auf den Mailanbieter, alle Adressen der Domain in ein Postfach
      (Catch-all), Zugang per IMAP in `INBOUND_IMAP_URL`. Prüfen, dass zugestellte Mails einen `Delivered-To`- oder
      `X-Original-To`-Header tragen (sonst erkennt CLinks BCC-Kopien nicht).

## 6 · Konfiguration und Deployment

Auf dem Server einen privaten Ordner ausserhalb des Repos anlegen, z. B. `/etc/clinks` (`chmod 700`), und die
Vorlagen kopieren:

```sh
cp infra/production/env/api.env.example       /etc/clinks/api.env
cp infra/production/env/collab.env.example    /etc/clinks/collab.env
cp infra/production/env/powersync.env.example /etc/clinks/powersync.env
pnpm --filter @clinks/api keys                # liefert SIGNING_KEY und STORAGE_SECRET_KEY
```

- [ ] Werte eintragen (jede Zeile ist in der Vorlage kommentiert), dann
      `pnpm ops:check -- --config-dir /etc/clinks --offline` bis alles unter «Konfiguration» ✓ ist.
- [ ] **`STORAGE_SECRET_KEY` und `SIGNING_KEY` zusätzlich sicher ablegen** (Passwortmanager). Ohne
      `STORAGE_SECRET_KEY` müssen Mandanten ihre Bucket-Schlüssel neu eingeben.

Starten:

```sh
export CONFIG_DIR=/etc/clinks RELEASE=2026-11-24 WEB_HOST=app.clinks.ch API_HOST=api.clinks.ch \
       SYNC_HOST=sync.clinks.ch COLLAB_HOST=live.clinks.ch
docker compose -f infra/production/compose.yml config -q
docker compose -f infra/production/compose.yml build
docker compose -f infra/production/compose.yml up -d
pnpm ops:check -- --config-dir /etc/clinks
```

- [ ] Unter «Öffentliche Adressen» alles ✓: API antwortet, JWKS stimmt, Web-App mit HSTS und CSP.
- [ ] Im Browser `https://app.clinks.ch` öffnen, registrieren, Arbeitsbereich anlegen, einen Kontakt erfassen, auf
      einem zweiten Gerät anmelden: der Kontakt erscheint dort (= PowerSync läuft).

## 7 · Stripe

1. Im **Testmodus** beginnen: `STRIPE_SECRET_KEY=sk_test_… node apps/api/src/billing-catalog.ts` legt die sechs Preise
   (drei Pläne, monatlich und jährlich, CHF) an. Die JSON-Ausgabe als `STRIPE_PRICES` in `api.env`.
2. Stripe-Dashboard → Webhooks → Endpoint `https://api.clinks.ch/webhooks/stripe` mit
   `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`. Das Secret als
   `STRIPE_WEBHOOK_SECRET`.
3. Customer Portal aktivieren. Eine Testbuchung mit der Karte 4242 4242 4242 4242 machen; der Plan des Mandanten
   ändert sich.
4. Für echte Zahlungen: Konto aktivieren (Bank, Firmendaten), Schritte 1–2 mit `sk_live_` wiederholen.
   `STRIPE_TAX=true` erst, wenn die MWST-Registrierung in Stripe hinterlegt ist. TWINT gilt bei Stripe nicht für
   B2B-Zahlungen.

- [ ] `ops:check` zeigt unter «Zahlungen» «Live-Schlüssel» und ✓ für Webhook und Preise.

## 8 · Backups, Wiederherstellung, Alarme

- [ ] **Swiss Backup** bestellen und ein restic-Repository einrichten; das restic-Passwort getrennt aufbewahren
      (ohne es ist das Backup wertlos).
- [ ] `backup.sh` nächtlich per cron/systemd-Timer (Variablen im README), Ergebnis in eine Stempeldatei.
- [ ] **Wöchentlich** einen Snapshot zurückspielen und `restore-drill.sh` gegen einen separaten Test-Cluster
      laufen lassen. Einmal vor dem Pilot zusätzlich `pitr-drill.sh` mit dem echten Archiv: notiere, wie lange die
      Wiederherstellung dauert und wie viele Minuten Daten maximal verloren gehen.
- [ ] `monitor.sh` alle 5 Minuten aus dem privaten Netz. Den Exit-Status an einen Alarm koppeln, der dich wirklich
      erreicht (z. B. Uptime-Dienst mit SMS/Push), und einmal absichtlich auslösen.

## 9 · Vor echten Patientendaten

- [ ] Auftragsverarbeitungsverträge mit Infomaniak und Stripe abschliessen; Verzeichnis der
      Bearbeitungstätigkeiten (revDSG) anlegen.
- [ ] Aufbewahrungsfristen pro Dokumenttyp festlegen und Object Lock danach ausrichten.
- [ ] **Externer Penetrationstest** (siehe [security-review.md](../security-review.md) – die interne Prüfung ist
      gemacht).
- [ ] Pilot-Mandant mit echten Benutzern einrichten, Einladungen verschicken, eine Woche begleiten.
- [ ] Spitex: Mitarbeitenden die Rolle mit nur «eigene Einsätze» geben und eine Woche freigeben
      (siehe [spitex-freigabe.md](../product/spitex-freigabe.md)).
- [ ] `docs/plan.md` Phase 6 abhaken.

## Wenn etwas nicht geht

| Symptom                                       | Ursache meistens                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Kein Zertifikat, Browser warnt                | DNS zeigt noch nicht auf den Server; Caddy-Log ansehen                 |
| Anmeldung geht, aber nichts synchronisiert    | `PS_JWKS_URI` falsch oder Replikation fehlt → `ops:check`              |
| Upload von Dokumenten schlägt fehl            | CORS des Buckets passt nicht zu `WEB_ORIGIN` → `init-bucket.ts` erneut |
| Keine Anmeldecodes per Mail                   | SMTP-Zugang oder SPF/DKIM → `ops:check` «E-Mail»                       |
| Nach Neustart melden Mandanten Speicherfehler | `STORAGE_SECRET_KEY` wurde geändert – alten Wert zurück                |
