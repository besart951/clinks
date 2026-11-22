# TaskDetailPage

Die Detailansicht einer Aufgabe – eine eigene Seite mit eigener Adresse, kein Overlay. Links der Inhalt (Titel, Beschreibung, Checkliste, Aktivität), rechts die Attribute, nach Domänen gruppiert und als Accordion auf- und zuklappbar, wie bei Jira.

## Öffnen & zurück
Klick auf eine Karte (ohne Ziehen) oder `Enter` auf einer fokussierten Karte navigiert zu `#task-<id>` (z. B. `#task-t-142`): Kopf, Tabs und Board weichen der Aufgabe, die Seite gleitet 12px von rechts ein. „← Board“ oben links, `Esc` oder die Zurück-Taste des Browsers führen zurück zur Liste, von der man kam (Board oder Verlauf). Die Adresse lässt sich teilen und als Lesezeichen speichern.
`ui-task ui-task--page` ist der Standard; das schwebende Panel (`ui-task` ohne `--page`, mit `ui-scrim`) bleibt nur für Schnellansichten, z. B. aus der Suche.

## Aufbau
- `ui-task__bar`: „← Board“, Pfad (Projekt / Board / ID), Link kopieren.
- `ui-task__main`: ID in Mono, Titel (direkt editierbar), Beschreibung (editierbar, Hover zeigt die Fläche), Checkliste mit Fortschrittsbalken, Aktivität dieser Aufgabe.
- `ui-task__side`: `ui-accordion` mit je einem `ui-accordion__item` pro Domäne – **Details**, **Ort**, **Feldgerät**, **Planung**, **Verknüpfungen**. Kopf: Chevron, Name, Anzahl Attribute.

## Kommentare & @Erwähnungen
- Unter der Checkliste: Liste der Kommentare (Avatar, Name, relative Zeit, Text) und darunter der Composer (`ui-composer`): ein mitwachsendes Feld mit Rahmen in `input`, Fokus-Ring, „Kommentieren“-Button.
- `@` öffnet die Personenliste direkt an der Schreibmarke (`ui-mention-pop`, ↑/↓, Enter/Tab, Esc). Die Wahl wird ein nicht editierbarer Chip (`ui-mention`, leicht blau getönt).
- `⌘/Ctrl + Enter` sendet. Jede erwähnte Person bekommt einen Eintrag in ihrer Inbox; der Kommentar erscheint im Verlauf.
- Eigene Kommentare: Löschen bei Hover (mit „Rückgängig“).

## Attribute (`ui-attr`)
- Zeile = Label (`muted-foreground`, 112px) · Wert · × (`ui-reveal`, nur bei Hover/Fokus).
- **Text-Werte** sind direkt editierbar (Klick → Feld in `field` mit Ring; `Enter` übernimmt).
- **Auswahl-Werte** (Status, Priorität, Personen) öffnen ein `ui-menu`. Status verschiebt die Karte auf dem Board.
- **Hinzufügen:** „+ Attribut hinzufügen“ am Ende jeder Domäne öffnet die noch freien Attribute genau dieser Domäne; das neue Attribut gleitet ein und ist sofort im Bearbeiten-Modus.
- **Entfernen:** × klappt die Zeile weg; Toast mit „Rückgängig“ setzt sie an der alten Stelle zurück.
- Jede Änderung erscheint sofort in der Aktivität der Aufgabe und im Projekt-Verlauf (ActivityPage) mit Vorher/Nachher.

## Der Consumer liefert
Den Attribut-Katalog pro Domäne (`key`, Label, Art: text | person | status | priority …), die gesetzten Werte der Aufgabe, und Handler für Ändern, Hinzufügen, Entfernen.

## Motion
Seite gleitet 12px von rechts ein (320ms); Accordion: `grid-template-rows` 0fr → 1fr, Chevron dreht von −90° auf 0°, Inhalt blendet 60ms verzögert ein; neue Attribute gleiten mit kurzem `accent`-Aufleuchten ein; entfernte klappen in 200ms zu; gewählte Werte federn kurz.

## Regeln
- Leere Domänen bleiben sichtbar (Anzahl 0) – so weiss man, was es gibt.
- Max. ~8 Attribute pro Domäne; mehr → eigene Domäne.
- Die Reihenfolge der Domänen ist fest; offen/zu merkt sich pro Person.

## shadcn/ui + React
eigene Route (`/projects/[id]/tasks/[taskId]`, App Router) – optional zusätzlich als Intercepting Route im `<Sheet>` für Schnellansichten; `<Accordion type="multiple">` für die Domänen; `<DropdownMenu>`/`<Command>` zum Hinzufügen; Inline-Edit mit `contentEditable` oder `<Input>` bei Fokus; `motion` für `layout`-Animationen.
