# Stille Physio – Weg zur Produktion

2026-11-20 · Besart Morina

## Fazit

Der Prototyp zeigt die Abläufe einer Einzelpraxis vollständig und bedienbar – als Produkt für echte Patientendaten ist er aber nicht einsetzbar. Drei Dinge blockieren den Start:

1. **Plattform:** Er läuft als Claude-Artefakt. Daten liegen nicht nachweislich in der Schweiz, es gibt keinen Vertrag über die Auftragsbearbeitung, und jede Person mit Zugriff auf die Seite sieht alle Dossiers.
2. **Zugänge:** Es fehlen Anmeldung mit zweitem Faktor, Rollen (Therapeut:in, Empfang) und ein echtes Login für Patient:innen – die Patienten-App ist heute eine Vorschau innerhalb der Praxisansicht.
3. **Abrechnung:** Rechnungen gehen nur als PDF raus. Für Tiers payant braucht es den XML-Standard des Forum Datenaustausch und einen Intermediär; die Tarifwerte sind teilweise Beispiele.

Weiterverwenden lässt sich das Konzept: Datenmodell, Bildschirme, Regeln zu Verordnungen, Formulare und Unterschriftenablauf. Meine Schätzung für den Weg bis zum ersten produktiven Einsatz in einer Pilotpraxis: 9–12 Monate mit einem kleinen Team (Entwicklung, Datenschutz-/Rechtsberatung, eine Pilotpraxis).

## Gesamtbild

Vier Bereiche müssen vor dem ersten echten Patienten gelöst sein, sieben weitere vor dem Start einer Praxis, drei können danach folgen.

| Bereich                    | Im Prototyp                                       | Was für den Betrieb fehlt                                                                  | Priorität  |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------- |
| Plattform und Hosting      | Claude-Artefakt mit dessen Datenbank              | Eigene Anwendung, Rechenzentrum in der Schweiz, Vertrag zur Auftragsbearbeitung, Backups   | Blocker    |
| Anmeldung und Rollen       | Claude-Konto; wer Zugriff hat, sieht alles        | Login mit zweitem Faktor, Rollen, automatische Sperre, Rechte pro Dossier                  | Blocker    |
| Datenschutz-Unterlagen     | Konzept                                           | Bearbeitungsverzeichnis, Datenschutz-Folgenabschätzung, Datenschutzerklärung, Meldeprozess | Blocker    |
| Abrechnung an Versicherer  | PDF mit QR-Zahlteil                               | XML nach Forum Datenaustausch, Versand über Intermediär, Rückweisungen                     | Blocker    |
| Tarife                     | Auszug 7301/7311 und 27110/27210, Beispielwerte   | Vollständige Kataloge KVG und UV/MV/IV, Taxpunktwerte je Kanton und Versicherer, Updates   | Vor Start  |
| QR-Rechnung                | Swiss QR mit strukturierter Adresse               | Prüfung gegen SIX-Vorgaben, Empfänger bei Tiers payant, echte QR-IBAN                      | Vor Start  |
| Protokoll                  | Jede:r mit Schreibrecht kann Einträge ändern      | Unveränderliches Protokoll, auch für Lesezugriffe                                          | Vor Start  |
| Dokumente und Unterschrift | Ablage, PDF mit einfacher elektronischer Signatur | PDF/A, Archiv über 20 Jahre, juristisch geprüfte Vorlagen                                  | Vor Start  |
| Datenübernahme             | –                                                 | Import aus der bisherigen Praxissoftware                                                   | Vor Start  |
| Qualität                   | Manuelle Browsertests                             | Automatisierte Tests, Penetrationstest, Barrierefreiheit                                   | Vor Start  |
| Betrieb                    | –                                                 | Support, Updates, Verträge, Preise                                                         | Vor Start  |
| Patienten-App              | Vorschau in der Praxisansicht                     | Eigenes Login, Benachrichtigungen, Web-App oder App-Stores                                 | Nach Start |
| Erinnerungen               | Nur Anzeige                                       | SMS- und E-Mail-Versand mit Einwilligung                                                   | Nach Start |
| Gesundheitsdossier (E-GD)  | –                                                 | Anbindung, sobald das neue Gesetz gilt                                                     | Nach Start |

## Recht und Datenschutz

Der Software-Anbieter wird rechtlich zur Hilfsperson der Praxis und muss Gesundheitsdaten so schützen, wie es die Therapeut:in selbst müsste. Daraus folgen diese Pflichten:

| Thema                             | Vorgabe                                                                                                                                                                                                                                                                                                                                                                                                                                                | Was es konkret braucht                                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Berufsgeheimnis                   | Physiotherapeut:innen und ihre Hilfspersonen unterstehen Art. 321 StGB; IT-Dienstleister gehören dazu ([PwC](https://www.pwc.ch/de/insights/gesundheitswesen/cybersecurity.html), [Kanton Bern](https://www.gsi.be.ch/content/dam/gsi/dokumente-bilder/de/dienstleistungen/berufe/berufliche-schweigepflicht/leitfaden-schweigepflicht-januar-2023-d.pdf))                                                                                             | Vertrag zur Auftragsbearbeitung mit Geheimhaltungsklausel; Hosting bei einem Anbieter ohne Zugriff ausländischer Behörden ([privatim](https://www.ag.ch/media/kanton-aargau/dvi/dokumente/ges/organisation/idag/datenschutz/privatim-cloud-merkblatt-v3-02-20261002-def-de.pdf)) |
| Datenschutz                       | Gesundheitsdaten sind besonders schützenswert ([Kanton Zürich](https://www.zh.ch/de/wirtschaft-arbeit/wirtschaftsstandort/innovation-sandbox/phase-ii/medizinische-dokumentation/2-datenschutz-berufsgeheimnis-und-die-cloud.html)); Bearbeitungsverzeichnis, Meldung an den EDÖB bei Datenpannen ([OdA KT](https://www.oda-kt.ch/fileadmin/user_upload/pdf/D/Merkblaetter/240214_Merkblatt_f%C3%BCr_TherapeutInnen_zum_rev._Datenschutzrecht_de.pdf)) | Vorlagen für Verzeichnis und Folgenabschätzung, Prozess für Datenpannen, Auskunft und Herausgabe per Knopfdruck                                                                                                                                                                  |
| Information und Einwilligung      | Information ohne Unterschrift, Einwilligung pro Weitergabe ([EDÖB](https://www.edoeb.admin.ch/dam/de/sd-web/aM0429bnFlib/Merkblatt_Erl%C3%A4uterungen%20Patientenformularen%20%C3%A4rztliche%20und%20therapeutische%20Konsultationen_DE.pdf))                                                                                                                                                                                                          | Im Prototyp umgesetzt; Vorlagentexte juristisch prüfen lassen                                                                                                                                                                                                                    |
| Aufbewahrung                      | 20 Jahre wegen der Verjährung nach Art. 60 Abs. 1bis und 128a OR; kantonal teils kürzer ([FMH](https://contens30.fmh.ch/files/pdf28/leitfaden-fuer-die-aufbewahrung-und-archivierung.pdf))                                                                                                                                                                                                                                                             | Archiv, das 20 Jahre lesbar bleibt (PDF/A, Exporte), Löschkonzept nach Fristablauf                                                                                                                                                                                               |
| Elektronisches Gesundheitsdossier | Der Bundesrat hat am 5. November 2025 das neue Gesetz (EGDG) verabschiedet; Physiotherapeut:innen, die über die Grundversicherung abrechnen, sollen zur Nutzung verpflichtet werden ([BAG](https://www.bag.admin.ch/de/newnsb/kr4DmHtSWC_pdU5RVB6KX))                                                                                                                                                                                                  | Schnittstelle einplanen; das Gesetz liegt beim Parlament, ein Datum gibt es noch nicht                                                                                                                                                                                           |
| Medizinprodukt                    | Software ist ein Medizinprodukt, wenn sie für Diagnose, Therapie oder Überwachung bestimmt ist; der Hersteller qualifiziert selbst ([Johner](https://69.johner-institute.com/blog/?p=6968), [Swissmedic](https://www.swissmedic.ch/swissmedic/en/home/ueber-uns/publikationen/visible/visible-single-page.spa.v7.app/de/nachgeforscht.html))                                                                                                           | Zweckbestimmung schriftlich festhalten: Verwaltung, Dokumentation, Abrechnung. Keine automatischen Therapieempfehlungen ohne erneute Prüfung                                                                                                                                     |
| Unterschrift                      | Gleichgestellt mit der Handschrift ist nur die qualifizierte elektronische Signatur ([WEKA](https://www.weka.ch/themen/personal/arbeitsvertraege-und-reglemente/arbeitsvertrag/article/elektronische-signatur-formvorschriften-in-arbeitsvertraegen/))                                                                                                                                                                                                 | Für Einwilligungen genügt die einfache Signatur; für Verträge mit Schriftform eine QES-Anbindung prüfen                                                                                                                                                                          |

Offen: ob der Wohnkanton der Praxis zusätzliche Vorgaben macht (Gesundheitsgesetz, Dokumentationspflicht).

## Abrechnung

Die Abrechnung ist der grösste fachliche Brocken: Ohne elektronischen Versand und vollständige Tarifkataloge kann eine Praxis nicht wechseln.

| Thema                  | Stand heute                                                                                                                                                                                                                                                                                                                                              | Im Prototyp                                                   | Was es braucht                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| KVG-Tarif ab 2027      | Am 2. April 2026 beim Bundesrat eingereicht, Einführung per 1. Januar 2027 geplant ([Physioswiss](https://physioswiss.ch/wp-content/uploads/sites/1/mm_kvg_struktur_2026_final_de.pdf)); Genehmigung steht noch aus ([physiotherapie24](https://www.physiotherapie24.net/news/kvg-tarifstruktur-physiotherapie-2027.html))                               | Zwei Positionen (27110, 27210), Umstellung per Stichdatum     | Ganzer Katalog mit Limitationen und Kombinationsregeln, Sturzprävention, Leistungen in Abwesenheit; Umstellung erst nach Bundesratsentscheid |
| KVG-Tarif bis 2026     | Seit 2018 unverändert, vom Bundesrat festgelegt ([BAG](https://www.bag.admin.ch/de/leistungen-physiotherapie))                                                                                                                                                                                                                                           | 7301 und 7311                                                 | Restliche Positionen und Zuschläge                                                                                                           |
| UV/MV/IV               | Tarif 311, Positionen 25.xxx, Taxpunktwert CHF 1.00 ([Merkblatt](https://physioswiss.ch/wp-content/uploads/sites/1/2600106_de_merkblatt_einfuehrung-struktur-kvg_final.pdf), [Vereinbarung](https://physioswiss.ch/wp-content/uploads/sites/1/a07-vereinbarung-ueber-den-taxpunktwert-physioswiss_de_uv_mv_iv.pdf))                                      | Eine Platzhalter-Position mit Beispielwert                    | Echter Katalog 25.xxx                                                                                                                        |
| Taxpunktwerte KVG      | Je Kanton und Versicherergruppe, z. B. Solothurn CHF 1.33 ab 2026 ([RRB SO](https://rrb.so.ch/beschlussnummer/2026_353/download/eaa5019ae3644d759f6a5bd6a239a9b1))                                                                                                                                                                                       | Ein Wert pro Praxis (Beispiel 1.08)                           | Tabelle Kanton × Versicherergruppe mit Gültigkeit, gepflegt durch den Anbieter                                                               |
| Elektronische Rechnung | CSS nimmt generalInvoice 4.5 bis 30. Juni 2027 und 5.0 ab 2026 an ([CSS](https://www.css.ch/de/leistungserbringer/austausch/datenaustausch/standards.html)); Physioswiss verlangt die XML-Schnittstelle ([Physioswiss](https://www.physioswiss.ch/media/8759/download/Softwarel%C3%B6sungen%20f%C3%BCr%20Physiotherapeuten_d_230927.pdf?v=2))            | Keine                                                         | generalInvoice 5.0 erzeugen, Versand über einen Intermediär wie MediData, Rückweisungen und Storno verarbeiten                               |
| QR-Rechnung            | Seit November 2025 nur strukturierte Adressen ([SIX](https://www.six-group.com/de/products-services/banking-services/payment-standardization/standards/qr-bill.html)); Version 2.4 ab 14. November 2026 ohne technische Änderung für CHF ([SIX](https://www.six-group.com/dam/download/banking-services/standardization/qr-bill/ig-qr-bill-v2.4-de.pdf)) | Strukturierte Adresse; bei Tiers payant fehlen Empfängerdaten | Gegen den SIX-Validator testen, Empfänger bei Tiers payant korrekt füllen                                                                    |
| Zahlungseingang        | –                                                                                                                                                                                                                                                                                                                                                        | Manuell „bezahlt“                                             | Kontoauszüge (camt.054) einlesen und über die QR-Referenz zuordnen                                                                           |
| Rückforderungsbeleg    | Bei Arztrechnungen gehört seit 2026 ein QR-Code-Beiblatt dazu ([SRF](https://www.srf.ch/sendungen/kassensturz-espresso/espresso/aenderungen-wegen-tardoc-neue-arztrechnungen-ab-2026-das-muessen-sie-wissen))                                                                                                                                            | Einfacher Beleg                                               | Klären, ob das für Physiotherapie gilt, und den Beleg nach Forum-Datenaustausch-Layout erzeugen                                              |

Vor dem ersten Versand an einen Versicherer: Testlauf mit dem Intermediär, Prüfung durch eine Pilotpraxis und Schulung zur neuen Tarifstruktur.

## Technik und Sicherheit

Der Prototyp lädt alle Daten in den Browser und speichert sie in der Datenbank des Artefakts. Das reicht für die Vorschau, aber nicht für den Betrieb.

| Thema                   | Im Prototyp                                                  | Was es braucht                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architektur             | Eine HTML-Datei, Logik im Browser                            | Eigener Server mit API (z. B. TypeScript/Node), relationale Datenbank (PostgreSQL), Geschäftsregeln wie Verordnungen und Tarife serverseitig geprüft |
| Hosting                 | Claude-Artefakt                                              | Rechenzentrum in der Schweiz mit ISO 27001, Vertrag zur Auftragsbearbeitung, getrennte Umgebungen für Test und Produktion                            |
| Datenmenge              | Grenze von 25 000 Datensätzen, alles wird beim Start geladen | Paginierte Abfragen; eine Praxis erzeugt in 20 Jahren leicht 100 000 Termine und Notizen                                                             |
| Anmeldung               | Claude-Konto                                                 | Login mit zweitem Faktor (Passkey oder App), automatische Sperre am Praxis-PC, kurze Sitzungen auf dem iPad im Unterschriftsmodus                    |
| Rollen                  | Alle sehen alles                                             | Rollen Inhaber:in, Therapeut:in, Empfang; Empfang sieht keine Behandlungsnotizen                                                                     |
| Verschlüsselung         | AHV-Nummer nur in der Anzeige maskiert                       | Verschlüsselung bei der Übertragung und auf dem Speicher, AHV-Nummer und Dokumente zusätzlich auf Feldebene                                          |
| Protokoll               | Änderbar, nur Schreibvorgänge                                | Nur anfügbar, mit Prüfsummen-Kette; auch Lesezugriffe auf Dossiers protokollieren                                                                    |
| Gleichzeitiges Arbeiten | Wer zuletzt speichert, gewinnt                               | Versionsprüfung pro Datensatz, Hinweis bei Konflikten                                                                                                |
| Backup                  | Keines                                                       | Tägliche verschlüsselte Sicherung an zweitem Schweizer Standort, regelmässiger Wiederherstellungstest                                                |
| Export                  | Einzelne Dokumente                                           | Vollexport pro Patient:in (Auskunftsrecht) und pro Praxis (Anbieterwechsel)                                                                          |
| Dokumente               | PDF ohne Archivformat, Word/Excel eingebettet                | PDF/A für erzeugte Formulare, Virenprüfung bei Uploads, Speicher mit Aufbewahrungssperre                                                             |
| Qualität                | Manuelle Browsertests                                        | Automatisierte Tests für Tarif- und Verordnungsregeln, Penetrationstest vor dem Start, WCAG-2.1-AA-Prüfung                                           |
| Offline                 | –                                                            | Kalender und Tagesliste lesbar bei Internetausfall                                                                                                   |

Aus dem Prototyp übernehmen lassen sich Datenmodell, Oberfläche, Übersetzungen und die Regellogik in core.js – sie sollte als Erstes in TypeScript und mit Tests abgesichert werden.

## Patienten-App

Die Patienten-App ist heute eine Vorschau in der Praxisansicht. Für echte Patient:innen braucht sie einen eigenen Zugang mit eigenen Rechten.

- **Zugang:** Einladung per SMS oder E-Mail mit Einmal-Link, danach Passkey. Patient:innen sehen nur ihre eigenen Termine, Übungen und Dokumente.
- **Form:** Zuerst eine Web-App, die man auf dem Startbildschirm ablegen kann. Das spart die Prüfung in den App-Stores; eine native App lohnt sich erst bei Push-Mitteilungen in grosser Zahl.
- **Buchen und Absagen:** Freie Zeiten kommen vom Server; die Praxis legt fest, was online buchbar ist und bis wann Absagen kostenlos sind (passend zur Vorlage „Absagebedingungen“).
- **Erinnerungen:** SMS-Anbieter mit Sitz in der Schweiz, Einwilligung beim Erstkontakt, Abmeldung jederzeit. Keine Diagnosen im Nachrichtentext.
- **Unterschrift zu Hause:** Formulare, die nicht am iPad in der Praxis unterschrieben werden, könnten in der App unterschrieben werden – mit Identitätsprüfung über den Einladungslink.
- **Sprache:** DE/FR/IT sind vorhanden; Englisch wäre für Grenzgänger:innen und Tourist:innen sinnvoll.

Die App kann nach dem Start der Praxissoftware folgen; ohne sie läuft der Betrieb vollständig.

## Betrieb

Neben der Software braucht es ein Unternehmen, das sie verantwortet.

| Bereich                | Was es braucht                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verträge               | Nutzungsbedingungen, Vertrag zur Auftragsbearbeitung mit Geheimhaltungspflicht, Service-Level (Verfügbarkeit, Reaktionszeiten), Regelung für Vertragsende mit Datenherausgabe |
| Datenschutz der Praxis | Vorlagen für Bearbeitungsverzeichnis, Datenschutzerklärung der Praxis und Folgenabschätzung, die Praxen übernehmen können                                                     |
| Haftung                | Berufs- und Cyber-Haftpflichtversicherung des Anbieters                                                                                                                       |
| Support                | Erreichbarkeit zu Praxiszeiten in DE und FR, Hilfeseiten, Statusseite bei Störungen                                                                                           |
| Einführung             | Datenimport aus der bisherigen Software, Einrichtung von Tarifen und Vorlagen, Schulung (1–2 Stunden)                                                                         |
| Pflege                 | Tarif- und Taxpunktwert-Updates zu Jahresbeginn, Sicherheitsupdates, Anpassung an neue XML-Versionen                                                                          |
| Vorfälle               | Ablauf bei Datenpannen inkl. Meldung an den EDÖB und Information der Praxen                                                                                                   |
| Preis                  | Monatsabo pro Therapeut:in; zum Vergleich: gängige Physio-Lösungen liegen je nach Umfang bei rund CHF 50–150 pro Monat (Annahme, vor Festlegung prüfen)                       |
| Verband                | Aufnahme in die Softwareliste von Physioswiss, sobald die XML-Schnittstelle steht                                                                                             |

## Fahrplan

_Abbildung: Fahrplan · 5 Phasen, 4 Prüfpunkte (im Original-Doc)_

Die Monate sind eine Schätzung für ein Team aus zwei bis drei Entwickler:innen plus externer Rechts- und Datenschutzberatung. Phasen 2 und 3 laufen teilweise parallel; die Umstellung auf den Tarif 2027 hängt vom Bundesratsentscheid ab und kann den Zeitplan verschieben.

## Offene Entscheidungen

Diese Fragen bestimmen Aufwand und Reihenfolge und sollten vor Phase 2 beantwortet sein:

1. **Selbst entwickeln oder auf Bestehendem aufbauen?** Eine eigene Plattform gibt volle Kontrolle; eine Partnerschaft mit einem bestehenden Anbieter (Abrechnung, Hosting) verkürzt den Weg deutlich.
2. **Hosting-Partner:** Schweizer Rechenzentrum mit Gesundheitsdaten-Erfahrung, oder eine Schweizer Region eines grossen Cloud-Anbieters mit zusätzlicher Verschlüsselung? Datenschützer sehen Letzteres kritisch.
3. **Intermediär für die Abrechnung:** MediData oder ein anderer Anbieter – bestimmt Verträge, Kosten pro Rechnung und Testablauf.
4. **Start mit oder nach dem Tarif 2027?** Ein Start erst mit dem neuen KVG-Tarif spart die Umsetzung des alten Katalogs, macht den Termin aber vom Bundesrat abhängig.
5. **Zielgruppe:** Nur Einzelpraxen oder auch Gruppenpraxen mit mehreren Therapeut:innen und Standorten? Das verändert Rollen, Kalender und Preis.
6. **Unterschriften:** Genügt die einfache elektronische Signatur am iPad für alle Vorlagen, oder braucht es für einzelne Dokumente eine qualifizierte Signatur?
7. **Pilotpraxis:** Welche Praxis testet, in welchem Kanton, und mit welcher Software wechselt sie?

## Quellen

Stand der Recherche: 20. November 2026. Die Einschätzung ersetzt keine Rechts- oder Datenschutzberatung.

- Tarif: [Physioswiss – Medienmitteilung KVG-Struktur](https://physioswiss.ch/wp-content/uploads/sites/1/mm_kvg_struktur_2026_final_de.pdf), [Physioswiss – Einreichung beim Bundesrat](https://physioswiss.ch/news/neue-tarifstruktur-fuer-physiotherapie-beim-bundesrat-zur-genehmigung-eingereicht/), [BAG – Leistungen Physiotherapie](https://www.bag.admin.ch/de/leistungen-physiotherapie), [physiotherapie24](https://www.physiotherapie24.net/news/kvg-tarifstruktur-physiotherapie-2027.html)
- Elektronische Abrechnung: [CSS – Standards Datenaustausch](https://www.css.ch/de/leistungserbringer/austausch/datenaustausch/standards.html), [Physioswiss – Softwarelösungen](https://www.physioswiss.ch/media/8759/download/Softwarel%C3%B6sungen%20f%C3%BCr%20Physiotherapeuten_d_230927.pdf?v=2)
- QR-Rechnung: [SIX – QR-Rechnung](https://www.six-group.com/de/products-services/banking-services/payment-standardization/standards/qr-bill.html), [SIX – Implementation Guidelines 2.4](https://www.six-group.com/dam/download/banking-services/standardization/qr-bill/ig-qr-bill-v2.4-de.pdf)
- Gesundheitsdossier: [BAG – Botschaft EGDG](https://www.bag.admin.ch/de/newnsb/kr4DmHtSWC_pdU5RVB6KX), [BAG – Totalrevision EPDG](https://www.bag.admin.ch/de/epd-weiterentwickeln-totalrevision)
- Berufsgeheimnis und Cloud: [Kanton Zürich – Innovation-Sandbox](https://www.zh.ch/de/wirtschaft-arbeit/wirtschaftsstandort/innovation-sandbox/phase-ii/medizinische-dokumentation/2-datenschutz-berufsgeheimnis-und-die-cloud.html), [privatim – Merkblatt Cloud](https://www.ag.ch/media/kanton-aargau/dvi/dokumente/ges/organisation/idag/datenschutz/privatim-cloud-merkblatt-v3-02-20261002-def-de.pdf), [PwC – Cybersecurity im Gesundheitswesen](https://www.pwc.ch/de/insights/gesundheitswesen/cybersecurity.html)
- Datenschutz: [EDÖB – Patientenformulare](https://www.edoeb.admin.ch/dam/de/sd-web/aM0429bnFlib/Merkblatt_Erl%C3%A4uterungen%20Patientenformularen%20%C3%A4rztliche%20und%20therapeutische%20Konsultationen_DE.pdf), [OdA KT – Merkblatt Datenschutz](https://www.oda-kt.ch/fileadmin/user_upload/pdf/D/Merkblaetter/240214_Merkblatt_f%C3%BCr_TherapeutInnen_zum_rev._Datenschutzrecht_de.pdf)
- Aufbewahrung: [FMH – Leitfaden Aufbewahrung und Archivierung](https://contens30.fmh.ch/files/pdf28/leitfaden-fuer-die-aufbewahrung-und-archivierung.pdf)
- Medizinprodukt: [Johner Institut](https://69.johner-institute.com/blog/?p=6968), [Swissmedic](https://www.swissmedic.ch/swissmedic/en/home/ueber-uns/publikationen/visible/visible-single-page.spa.v7.app/de/nachgeforscht.html)
