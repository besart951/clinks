# ActivityPage

Der Verlauf eines Projekts: jede Änderung mit Person, Objekt, Zeitpunkt und den Feldern vorher/nachher – nach Tagen gruppiert, filterbar, und jeder Stand lässt sich zurückholen.

## Aufbau
Gleiche Hülle wie die KanbanPage (Sidebar, Breadcrumb, Titel, Tabs mit „Verlauf“ aktiv). Darunter die Werkzeugleiste: Suche, `ui-segmented` für den Bereich (Alle · Aufgaben · Geräte · Vorlagen · Team), `ui-people` (Avatar-Toggles) für Personen, rechts die Anzahl. Dann `ui-timeline` → `ui-timeline__day` (sticky Datum) → `ui-event`s.

## Ein Eintrag (`ui-event`)
- **Immer sichtbar:** Avatar auf der Zeitleiste, Satz „**Person** hat **Objekt** verb“, darunter die Zusammenfassung (ein Feld: `Status Offen → In Arbeit`; mehrere: „3 Felder · Adresse, Objekttyp, Einheit“), rechts die Uhrzeit.
- **Bei Hover/Fokus** (`ui-reveal`): Link kopieren, Wiederherstellen.
- **Beim Klick** klappt `ui-event__detail` auf (`grid-template-rows` 0fr → 1fr, Panel blendet 60ms später ein): `ui-diff`-Tabelle Feld · Vorher (durchgestrichen, `muted-foreground`) → Nachher (`foreground`, 500), darunter Version, Person, Zeit und die Aktionen.
- Gelöschte Objekte: Objekt mit `destructive`-Unterstreichung und Hinweis „Wiederherstellbar bis …“.

## Der Consumer liefert
Pro Änderung: Person, Bereich, Zeitstempel, Verb, Objekt (Name + Link), Liste der Felder `[Feld, vorher, nachher]` (`–` für leer), Versionsnummer, ob wiederherstellbar.

## Motion
- Einträge steigen gestaffelt ein (`--i`), auch nach jedem Filterwechsel.
- Aufklappen gleitet, Chevron dreht sich, Panel folgt leicht verzögert.
- Neue Einträge (Wiederherstellen, Änderungen vom Board) erscheinen oben unter „Heute“ und leuchten kurz in `accent` auf.

## Regeln
- Satz aus Sicht der Person, Perfekt, Objekt verlinkt: „Lea K. hat Marco A. eingeladen“. Keine Systemsprache („Entity updated“).
- Vorher/Nachher immer als Werte, nie nur „geändert“. IDs und Adressen in Mono.
- Wiederherstellen erzeugt einen **neuen** Eintrag – der Verlauf wird nie umgeschrieben.
- Datumsköpfe: „Heute“, „Gestern“, danach Wochentag + Datum.
- Leere Filter → EmptyState mit „Filter zurücksetzen“.

## shadcn/ui + React
`<Collapsible>` pro Eintrag (oder `<Accordion type="multiple">`), `<ToggleGroup>` für Bereich und Personen, `<Avatar>`, `<Table>` für das Diff; Animation mit `motion` (`AnimatePresence` + `layout`).
