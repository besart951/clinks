# DatePicker

Wählt ein Datum aus einem Kalender – Zeitangaben werden nie als freies Textfeld erfasst.

## Markup
Auslöser: `ui-attr__value ui-attr__value--select` mit Kalender-Icon, Datum lang („Sa, 28. Nov.“; Jahr nur, wenn nicht das aktuelle) und `ui-attr__hint` relativ („in 8 Tagen“, „heute“, „vor 4 Tagen“; überfällige Fälligkeit mit `is-late` in `destructive`). Leer: „Datum wählen“ in `muted-foreground`.
Popover: `ui-menu ui-cal` → `ui-cal__head` (Monat + ‹ ›) → `ui-cal__grid` (Wochentage Mo–So, 6 Wochen; `is-out` für Nachbarmonate, `is-today` mit Kontur, gewählt `aria-selected` in `primary`) → `ui-cal__quick` (Heute · Morgen · In 1 Woche · Entfernen).

## Verhalten
- Öffnet am Auslöser (fixed, über allem; klappt nach oben, wenn unten kein Platz ist), Fokus auf dem gewählten Tag bzw. heute.
- **Monat & Jahr springen:** Der Titel („Dezember 2026 ▾“, `ui-cal__title`) öffnet die Monatsübersicht (3 × 4, ‹ › blättert Jahre); dort öffnet das Jahr eine Jahresübersicht (12 Jahre, ‹ › blättert um 12). Eine Auswahl führt eine Ebene zurück, `Esc` ebenso. Zellen `ui-cal__cell` im Raster `ui-cal__grid--wide`; Ebenenwechsel zoomt leicht (0.96 → 1), Blättern gleitet.
- Tastatur: Pfeile = Tag/Woche, Bild↑/↓ = Monat, Enter = wählen, Esc = schliessen.
- Monatswechsel gleitet 12px in Blätterrichtung; gewählter Wert federt kurz.
- Ein neu hinzugefügtes Datums-Attribut öffnet den Kalender sofort.
- **Mit Uhrzeit:** Schalter „Uhrzeit“ im Popover (aus = ganztägig). Eingeschaltet erscheinen ein kleines Zeitfeld (`ui-cal__timeinput`, 15-Minuten-Schritte) und Schnellzeiten 08:00 · 12:00 · 17:00; ein Tag wird dann nur markiert, „Übernehmen“ (oder Enter im Zeitfeld) übernimmt. Gespeichert als `YYYY-MM-DD` bzw. `YYYY-MM-DDTHH:MM`; angezeigt „Mo, 30. Nov., 17:00“, auf der Karte „30. Nov. 17:00“. Überfällig zählt dann auf die Minute.
- **Kompakt:** Der Auslöser bleibt eine Zeile (13px, auf Touch 14px, kein Umbruch, abgeschnitten mit …) – er ist ein Knopf, kein Textfeld.
- Dauern (Schätzung) wählt man aus festen Stufen (30 min … 1 Woche) per `ui-menu`, ebenfalls kein Textfeld.

## shadcn/ui
`<Popover>` + `<Calendar mode="single" locale={de} weekStartsOn={1}>` (react-day-picker), Auslöser als `<Button variant="ghost">`.
