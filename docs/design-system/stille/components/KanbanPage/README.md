# KanbanPage

Eine vollständige Projektseite mit Board: Sidebar, Breadcrumb, Titel, Tabs, Werkzeugleiste und vier Spalten, deren Karten sich per Maus oder Tastatur verschieben lassen.

## Aufbau
`ui-sidebar` | `main` → `ui-breadcrumb` → Titel (`text-display`) + `ui-avatar-group` → `ui-tabs` → Werkzeugleiste (Filter-Input, Filter-Button, Primäraktion rechts) → `ui-board` mit `ui-column`s.
Spalte: `ui-column__head` (`ui-reveal-scope`: Titel, `ui-column__count`, Werkzeuge `ui-reveal`) → `ui-column__list ui-stagger` mit `ui-kcard`s (`--i` = Position für das gestaffelte Einblenden).
Karte: `ui-kcard ui-reveal-scope` → `ui-kcard__top` (`ui-kcard__heading` mit `ui-kcard__id` in Mono über dem Titel, daneben ⋯ als `ui-reveal`) → `ui-kcard__meta` (Ort als Outline-Badge, Fälligkeit, Avatar – eine Zeile, nie umbrechen).

## Der Consumer liefert
Spalten (id, Name), Karten (Titel, Ort, ID, Verantwortliche, optional Fälligkeit) und einen `onMove(cardId, toColumn, index)`-Handler, der optimistisch umsortiert und bei Fehler zurückrollt.

## Motion
- **Aufheben:** Nach 5px Bewegung wird ein Klon zum Geist (`is-lifted`: `shadow-md`, 1.5° gedreht, 103 %), das Original bleibt als gestrichelter Platzhalter (`is-dragging`).
- **Umsortieren:** Jede DOM-Änderung läuft durch FLIP – andere Karten gleiten in 320ms `--ease-out` an ihren neuen Platz, nichts springt.
- **Ablegen:** Der Geist gleitet in den Platzhalter, die Karte federt kurz nach (`is-dropped`, `--ease-spring`); der Zähler der Spalte hüpft (`is-bump`).
- **Zielspalte** färbt sich beim Überfahren in `muted` (`is-over`).
- **Neue Karten** steigen ein (`is-new`), Filter blendet per FLIP aus und schiebt den Rest nach.
- **Rückmeldung:** Wechsel der Spalte → Toast „Verschoben nach …“ mit „Rückgängig“ (gleitet zurück).

## Daten
Karten, Reihenfolge (`order` als Zwischenwert, damit nur die bewegte Karte geschrieben wird) und Spaltenfarben liegen in der Datenbank. Änderungen anderer erscheinen live und gleiten per FLIP an ihren Platz. Ein Klick (ohne Ziehen) öffnet die Aufgabe als eigene Seite.

## Regeln
- Karten bleiben kurz: Titel max. zwei Zeilen, eine Metazeile. Details öffnen sich im Sheet rechts, nicht in der Karte.
- Aktionen (⋯, „+“ pro Spalte) nur bei Hover/Fokus; die Primäraktion „Aufgabe erstellen“ ist immer sichtbar.
- Tastatur: Karte fokussieren, `Alt` + ↑/↓ sortiert, `Alt` + ←/→ wechselt die Spalte. Drag & Drop darf nie der einzige Weg sein.
- Max. ~6 Spalten; Spaltenbreite 232–280px, horizontal scrollen statt stauchen.
- `prefers-reduced-motion`: Karten wechseln sofort, ohne Gleiten.

## shadcn/ui + React
Layout mit `<SidebarProvider>`/`<Sidebar>`, Karten als `<Card>`; Drag & Drop mit **dnd-kit** (`@dnd-kit/core` + `@dnd-kit/sortable`, `DragOverlay` = Geist, `useSortable` liefert die FLIP-Transforms) und **motion** (`layout`-Prop) für Einblenden und Filter.
