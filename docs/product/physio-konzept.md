# Stille Physio – Konzept Praxissoftware

2026-11-20 · Besart Morina · Original: [Claude Doc](https://claude.ai/artifact/SQvunpDerf2EQaHApgdMuJ)

## Ziel & Zielgruppe

Stille Physio ist die Praxissoftware für **eine Physiotherapeutin oder einen Physiotherapeuten mit eigener Praxis** in der Schweiz: Termine, Dossiers, Verordnungen und Abrechnung an einem Ort – im Browser am Behandlungsplatz und als App für Patient:innen.

- **Hauptnutzer:in:** die Praxisinhaberin, die zwischen zwei Behandlungen in 30 Sekunden dokumentieren, den nächsten Termin setzen und am Monatsende ohne Nacharbeit abrechnen will.
- **Zweite Nutzergruppe:** Patient:innen, die über die App Termine buchen und verschieben, Erinnerungen bekommen und ihre Heimübungen sehen.
- **Sprachen:** Deutsch, Französisch, Italienisch von Anfang an; Datums-, Zahlen- und Währungsformat nach Schweizer Konvention (`20.11.2026`, `CHF 1’234.50`).
- **Gestaltung:** das Stille-System – ruhig, viel Weissraum, Details erst bei Hover oder per Popover, überall Bewegung.

Nicht Ziel der ersten Version: Gruppenpraxen mit Raum- und Personalplanung, Lohnbuchhaltung, Anbindung an Spitalsysteme.

## Schweizer Rahmenbedingungen

Die Software muss **zwei KVG-Tarife parallel** können: Bis Ende 2026 gilt die vom Bundesrat festgelegte Struktur mit Sitzungspauschalen (z. B. 7301, 48 TP), ab voraussichtlich 1. Januar 2027 die neue Struktur mit 5-Minuten-Positionen (27xxx). Die neue Struktur liegt beim Bundesrat; die Umstellung wird deshalb per Stichdatum konfigurierbar, nicht fest eingebaut.

| Thema                           | Regel                                                                                                                                            | Was die Software daraus macht                                                                          | Quelle                                                                                                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verordnung                      | max. 9 Sitzungen je ärztlicher Anordnung; erste Behandlung innert 5 Wochen; nach 36 Sitzungen Arztbericht nötig; Diagnose ist Pflicht            | Sitzungszähler 3/9 je Verordnung, Warnung bei Fristablauf und vor Sitzung 36, Diagnose als Pflichtfeld | [physioswiss FAQ](https://physioswiss.ch/wp-content/uploads/sites/1/221028_d_haeufige-fragen-zur-verordnung-von-physiotherapie_update-okt-2022.pdf), [FMH FAQ](https://contens30.fmh.ch/files/pdf27/faq_physiotherapie_de.pdf)                                        |
| Tarif KVG bis 2026              | Sitzungspauschalen, z. B. 7301 allgemeine Physiotherapie 48 TP, 7311 aufwändig 77 TP                                                             | Leistungserfassung per Klick auf Pauschale                                                             | [Tarifstruktur 1.1.2026](https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/oce/2025/68/de/pdf-a/fedlex-data-admin-ch-eli-oce-2025-68-de-pdf-a.pdf)                                                                                                       |
| Tarif KVG ab 2027 (eingereicht) | Positionen 27xxx pro 5 Minuten, z. B. 27110 Einzelbehandlung 7.36 TP, max. 50 Min.; abgerechnet wird die tatsächlich aufgewendete Zeit           | Sitzungsdauer aus dem Termin übernehmen, auf 5-Minuten-Blöcke runden, Limiten prüfen                   | [physioswiss Merkblatt](https://physioswiss.ch/wp-content/uploads/sites/1/2600106_de_merkblatt_einfuehrung-struktur-kvg_final.pdf), [Empfehlungsschreiben](https://physioswiss.ch/fri/wp-content/uploads/sites/7/260528_empfehlungsschreiben-zur-sturzpravention.pdf) |
| Tarif UV/MV/IV                  | seit 1. Juli 2025 Tarif 311, Positionen 25.xxx; TPW CHF 1.00                                                                                     | eigener Tarifkatalog je Kostenträger                                                                   | [Merkblatt](https://physioswiss.ch/wp-content/uploads/sites/1/2600106_de_merkblatt_einfuehrung-struktur-kvg_final.pdf), [TPW-Vereinbarung](https://physioswiss.ch/wp-content/uploads/sites/1/a07-vereinbarung-ueber-den-taxpunktwert-physioswiss_de_uv_mv_iv.pdf)     |
| Taxpunktwert KVG                | kantonal und je Versicherergruppe verschieden, z. B. Solothurn provisorisch CHF 1.33 ab 2026                                                     | TPW-Tabelle Kanton × Versicherer in den Einstellungen, mit Gültigkeitsdatum                            | [RRB SO 2026/353](https://rrb.so.ch/beschlussnummer/2026_353/download/eaa5019ae3644d759f6a5bd6a239a9b1)                                                                                                                                                               |
| Pflichtangaben                  | KVG: Versichertenkarte, AHV-Nummer, gültige Verordnung; UV: Unfallnummer + Unfalldatum; IV: Verfügungsnummer; MV: Versichertenkarte + AHV-Nummer | Pflichtfelder je Kostenträger im Dossier, Rechnung erst möglich, wenn vollständig                      | [Merkblatt](https://physioswiss.ch/wp-content/uploads/sites/1/2600106_de_merkblatt_einfuehrung-struktur-kvg_final.pdf)                                                                                                                                                |
| Wer bezahlt                     | KVG: Tiers garant ist die Regel; MV: Tiers payant gesetzlich (MVG 24); UV/IV üblicherweise Tiers payant                                          | Abrechnungsart je Fall, Kopie an Patient:in bei Tiers payant                                           | [FMH Leitfaden](https://leitfaden.fmh.ch/rechtlicher-leitfaden/4-leistungen-kvg/48-rechnungsstellung-kvg.pdf?c=24130), [Suva MV](https://www.suva.ch/de-ch/versicherung/militaerversicherung/militarversicherung-leistungsabrechnung)                                 |
| Zahlung                         | QR-Rechnung ist seit Oktober 2022 der einzige Einzahlungsschein                                                                                  | jede Rechnung mit Zahlteil und Swiss QR Code (QR-IBAN)                                                 | [Magic Heidi](https://magicheidi.ch/blog/physiotherapeut-rechnung-schweiz)                                                                                                                                                                                            |
| Aufbewahrung                    | Krankengeschichte 20 Jahre nach Abschluss                                                                                                        | Dossiers archivieren statt löschen; Löschung erst nach Frist                                           | [FMH Leitfaden Aufbewahrung](https://contens30.fmh.ch/files/pdf28/leitfaden-fuer-die-aufbewahrung-und-archivierung.pdf)                                                                                                                                               |
| Datenschutz                     | revDSG: Bearbeitungsverzeichnis, Datenschutz-Folgenabschätzung, Meldepflicht an den EDÖB bei Datensicherheitsverletzung                          | siehe Abschnitt Datenschutz                                                                            | [OdA KT Merkblatt](https://www.oda-kt.ch/fileadmin/user_upload/pdf/D/Merkblaetter/240214_Merkblatt_f%C3%BCr_TherapeutInnen_zum_rev._Datenschutzrecht_de.pdf)                                                                                                          |

Offen: elektronischer Versand an Versicherer über den Standard des Forum Datenaustausch (XML) ist für eine spätere Version vorgesehen; V1 erzeugt druck- und mailbare Rechnungen.

## Funktionsumfang V1

Vier Bereiche, die sich gegenseitig füttern: Ein Termin wird zur Sitzung, die Sitzung zählt auf die Verordnung, und die Sitzungen einer Verordnung werden zur Rechnung.

**Termine & Kalender**

- Tages- und Wochenansicht mit Zeitraster (Standard 07:00–19:00, 15-Minuten-Raster); Termine per Ziehen verschieben und in der Länge ändern.
- Termin-Popover: Patient:in, Behandlungsart, Dauer, Verordnung, Notiz; Details erst bei Hover.
- Serie planen aus einer Verordnung: „9 Termine, jeden Di + Do 08:30“, Konflikte werden markiert.
- Status je Termin: geplant · bestätigt · erschienen · abgesagt (fristgerecht / kurzfristig) · nicht erschienen.
- Freie Zeitfenster für die Online-Buchung festlegen.

**Dossier & Verordnungen**

- Stammdaten: Name, Geburtsdatum, AHV-Nummer, Adresse, Kontakt, Sprache, Kostenträger (KVG / UV / IV / MV / Selbstzahler) mit den jeweiligen Pflichtnummern.
- Verordnungen: verordnende Ärztin (GLN), Datum, Diagnose, Anzahl Sitzungen, Behandlungsart; Zähler und Fristen sichtbar.
- Verlaufsdokumentation pro Sitzung nach SOAP (Subjektiv, Objektiv, Assessment, Plan), mit Textbausteinen.
- Befund und Ziele, Dokumente (Verordnung, Berichte), Heimübungen.
- Alles nach Domänen als Accordion, Attribute zuschaltbar – wie im Stille-Board.

**Abrechnung**

- Leistungen werden aus erschienenen Sitzungen vorgeschlagen (Tarifposition, Taxpunkte, TPW).
- Rechnung je Verordnung oder Monat; Tiers garant mit Rückforderungsbeleg oder Tiers payant an den Versicherer.
- QR-Rechnung mit Zahlteil; Status offen · bezahlt · gemahnt; Mahnstufen.
- Selbstzahler-Leistungen (z. B. Massage) mit MWST 8.1 %, verordnete Physiotherapie MWST-befreit.

**Patienten-App**

- Termine sehen, buchen, verschieben, absagen (Frist 24 Stunden, danach Hinweis auf Kosten).
- Erinnerung 24 Stunden vorher (Push / SMS / E-Mail).
- Heimübungen mit Beschreibung und Häkchen pro Tag.
- Rechnungen ansehen; Sprache DE/FR/IT.

## Informationsarchitektur & Screens

_Abbildung: Informationsarchitektur · 2 Oberflächen, 1 Datenbank (im Original-Doc)_

Die Praxis navigiert über sechs Bereiche in der Seitenleiste; die Patienten-App hat drei Tabs und sieht nie Notizen oder Diagnosen.

## Interaktion & Motion

Im Ruhezustand zeigt jede Ansicht nur, was für die nächste Behandlung zählt; alles Weitere liegt hinter Hover, einem Icon oder einem Popover.

| Wo              | Immer sichtbar                                   | Bei Hover / Klick                                                                                |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Kalender-Termin | Name, Zeit, Farbe der Behandlungsart             | Popover mit Verordnung (5/9), Telefon, letzte Notiz; Aktionen Erschienen · Verschieben · Absagen |
| Patientenliste  | Name, nächster Termin                            | Icons für offene Verordnung, fällige Rechnung, fehlende Pflichtangabe; Tooltip mit Detail        |
| Dossier         | Name, Kostenträger, aktive Verordnung mit Zähler | AHV-Nummer maskiert (756.••••.••••.12), Klick zeigt sie; Domänen als Accordion                   |
| Verordnung      | Zähler 5/9, Ablaufdatum                          | Warn-Icon bei Frist < 7 Tagen oder Sitzung 34+, Popover mit Begründung                           |
| Rechnung        | Betrag, Status                                   | Leistungszeilen, Taxpunkte, TPW, QR-Zahlteil                                                     |

Bewegung folgt den Stille-Regeln: Popover wachsen aus ihrem Auslöser (200 ms), Seiten gleiten 12 px ein (320 ms), Termine gleiten beim Verschieben an ihren Platz (FLIP), Zähler hüpfen bei Änderung, `prefers-reduced-motion` schaltet alles auf sofort. Auf Touch sind versteckte Werkzeuge immer sichtbar; langes Drücken auf einen Termin hebt ihn zum Verschieben an.

## Datenmodell

Acht Sammlungen genügen für V1; jede Änderung schreibt zusätzlich einen Eintrag ins Protokoll.

| Sammlung        | Wichtigste Felder                                                                                                                                  | Beziehung                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `patients`      | Name, Geburtsdatum, AHV-Nr., Adresse, Telefon, E-Mail, Sprache, Kostenträger, Versicherer, Versichertennummer, UV-Fallnummer / IV-Verfügungsnummer | 1 Patient:in → n Verordnungen, Termine, Rechnungen |
| `prescriptions` | Patient, Ärztin (Name, GLN), Datum, Diagnose, Behandlungsart, Sitzungen max. (9), Serie Nr. (1–4+), Status                                         | 1 Verordnung → n Termine / Sitzungen               |
| `appointments`  | Patient, Verordnung, Start, Dauer (Min.), Behandlungsart, Status, Quelle (Praxis / App)                                                            | wird bei „erschienen“ zur Sitzung                  |
| `sessions`      | Termin, SOAP-Notiz, Tarifpositionen mit Taxpunkten                                                                                                 | gehört zu einer Rechnung, sobald abgerechnet       |
| `invoices`      | Patient, Kostenträger, Abrechnungsart (TG / TP), Positionen, TPW, Total CHF, QR-Referenz, Status, Mahnstufe                                        | n Sitzungen → 1 Rechnung                           |
| `exercises`     | Patient, Titel, Beschreibung, Häufigkeit, erledigt-Tage                                                                                            | für die Patienten-App                              |
| `settings`      | Praxis (Name, Adresse, GLN, ZSR-Nr., QR-IBAN, UID), Kanton, TPW-Tabelle, Tarif-Stichdatum, Öffnungszeiten, Sprache                                 | einmal pro Praxis                                  |
| `audit`         | wer, wann, Sammlung, Dokument, vorher / nachher                                                                                                    | Zugriffs- und Änderungsprotokoll                   |

## Datenschutz & Sicherheit

Gesundheitsdaten sind besonders schützenswert; die Software hält sie standardmässig verdeckt und protokolliert jeden Zugriff.

- **Hosting in der Schweiz**, Verschlüsselung bei Übertragung und Speicherung; Auftragsbearbeitungsvertrag mit der Praxis.
- **Privacy by Default:** AHV-Nummer, Diagnosen und Notizen sind in Listen maskiert und erscheinen erst auf Klick; Bildschirm sperrt nach 5 Minuten Inaktivität.
- **Zugriffsprotokoll** je Dossier (wer, wann, was) – Grundlage für Auskunftsbegehren und für die Meldung an den EDÖB bei einer Datensicherheitsverletzung.
- **Bearbeitungsverzeichnis** (Art. 12 DSG) als Vorlage in den Einstellungen; Hinweis, wann eine Datenschutz-Folgenabschätzung nötig ist.
- **Patienten-App** zeigt nur Termine, Übungen und Rechnungen – nie Verlaufsnotizen oder Diagnosen; Anmeldung per Einmal-Code.
- **Aufbewahrung:** abgeschlossene Dossiers werden archiviert, nicht gelöscht; Löschung erst nach 20 Jahren, mit Bestätigung.
- **Export** des ganzen Dossiers als PDF für Auskunftsrecht und Praxisübergabe.

Offen: Anbindung an das elektronische Patientendossier (EPD) ist für V1 nicht vorgesehen.

## Prototyp

Der klickbare Prototyp [Stille Physio – Praxis-Prototyp](https://claude.ai/artifact/StvqcLkZsMo5nhjEjN8edq) (Kopie: [`docs/reference/prototypes/stille-physio.html`](../reference/prototypes/stille-physio.html)) zeigt eine Beispielpraxis in Bern mit 8 Patient:innen.

- [x] Heute: Tagesagenda, nächste:r Patient:in, Warnungen zu Verordnungen und offenen Rechnungen
- [x] Kalender: Woche und Tag, Termine ziehen, Popover, Serie aus Verordnung
- [x] Patient:innen: Liste mit Hover-Icons, Dossier mit Accordion, SOAP-Notiz, Verordnungszähler
- [x] Abrechnung: Leistungen aus Sitzungen, Rechnung mit QR-Zahlteil, Status
- [x] Patienten-App: mobile Ansicht mit Buchen, Absagen, Übungen
- [x] Sprachumschalter DE / FR / IT, hell und dunkel

Beispieldaten sind erfunden; AHV-Nummern folgen nur dem Format, Tarifwerte stammen aus den oben verlinkten Quellen.
