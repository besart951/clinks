# Deployment auf debi

Bei einem Push auf `main` laufen die vier Quality-Jobs auf dem Runner `clinks-zep`. Auf zep startet der Benutzerdienst `clinks-ci.service` für jeden Job eine neue KVM-VM. Pull Requests verwenden GitHub-gehostete Runner. Für neue Runner-Registrierungen benötigt der Benutzerdienst die GitHub-Anmeldung auf zep.

## Produktion aktivieren

1. Im DNS der Zone `clinks.ch` zeigen die A-Records `www`, `api`, `sync` und `collab` auf `83.228.246.96`. Eventuelle AAAA-Records müssen denselben Dienst über IPv6 erreichen.
2. Einen privaten, versionierten S3-Bucket mit Object Lock und CORS für `https://www.clinks.ch` bereitstellen. Die Vorgaben für Aufbewahrung, Backups und den optionalen Stripe-Katalog stehen im [Produktionshandbuch](../README.md).
3. Unter **Settings → Environments → production → Environment secrets** das Secret `CLINKS_PROVIDER_ENV` als mehrzeilige dotenv-Datei anlegen. Erforderliche Felder:

   ```dotenv
   S3_ENDPOINT=https://s3.example.com
   S3_BUCKET=clinks-documents
   S3_REGION=region
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   SMTP_URL=smtps://user:password@mail.example.com:465
   MAIL_FROM=CLinks <no-reply@clinks.ch>
   ```

   Optional sind `SMTP_RELAY_URL`, `INBOUND_IMAP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICES` und `STRIPE_TAX`. Geheimnisse mit Dollarzeichen in dotenv in einfache Anführungszeichen setzen. Sonderzeichen in SMTP-Benutzername und Passwort URL-kodieren.
4. Der nächste erfolgreiche Push auf `main` baut die beiden Images auf zep, überträgt sie per SSH und migriert die neue Datenbank. Ohne Provider-Secret überspringt der Job die Veröffentlichung. `DEPLOY_KEY` und `DEPLOY_KNOWN_HOSTS` sind im GitHub-Environment bereits eingerichtet.

## Betrieb

Auf debi läuft PostgreSQL in `clinks-storage` mit einem eigenen Volume und internem Docker-Netz ohne veröffentlichten Port. Die lokalen Datenbankverbindungen laufen über dieses Netz. Unter `/srv/clinks/config` liegen auch der dauerhafte Signatur- und Verschlüsselungsschlüssel. Diese Dateien und die neue Datenbank gehören in die Produktionssicherung.

Der SSH-Schlüssel darf über `gate.sh` nur Provider-Konfiguration und Releases annehmen. `receive.sh` akzeptiert für ein Release nur den aktuellen Stand von `main`. Er richtet Zertifikate für die Dienstnamen ein und aktiviert die Webroute nach den Dienstprüfungen durch einen Nginx-Reload. Die bestehende Route für `/besmir/`, ihr Backend und ihre Datenbank bleiben eigenständig. Der laufende gemeinsame Nginx, die Zertifikatserneuerung und ihre Dateien unter `/srv/codelinks` werden weiter benötigt. Vor Änderungen der installierten Empfangsskripte die Versionen unter `/usr/local/sbin` mitprüfen.
