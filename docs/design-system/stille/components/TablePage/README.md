# TablePage

Alle Aufgaben als Tabelle – zum Sortieren, Filtern, schnellen Bearbeiten und für Änderungen an vielen Aufgaben auf einmal.

## Spalten
Auswahl · ID (Link zur Aufgabe) · Titel · Status · Verantwortlich · Priorität · Fällig · Ort · Öffnen (Hover). Kopf bleibt beim Scrollen stehen (`position: sticky`).

## Sortieren & Filtern
- Sortier- und Filter-Icon erscheinen bei Hover über dem Spaltenkopf (`ui-reveal`); ein **aktiver** Sortier- oder Filterzustand bleibt sichtbar (`is-revealed`, Icon in `foreground`).
- Klick auf den Spaltennamen sortiert, erneuter Klick dreht die Richtung (Pfeil hoch/runter).
- Filter (Status, Person, Priorität, Ort) sind Mehrfachauswahl-Menüs mit Häkchen; „Filter zurücksetzen“ erscheint in der Werkzeugleiste mit der Anzahl aktiver Filter.

## Bearbeiten in der Zelle
- Titel und Ort: Klick → Text direkt bearbeiten (`ui-cell--text`), Enter übernimmt, Esc verwirft. Die Zelle leuchtet nach dem Speichern kurz in `accent` auf.
- Status, Person, Priorität: Klick öffnet ein Menü; Fällig öffnet den DatePicker.
- Hover zeigt jede bearbeitbare Zelle als Feld (`field` + Haarlinie), damit klar ist, was klickbar ist.

## Mehrfachauswahl
- Checkbox pro Zeile, Shift-Klick wählt einen Bereich, Kopf-Checkbox alle/keine (teilweise = Strich).
- Ausgewählte Zeilen tönen sich leicht in `primary`.
- Die **Auswahl-Leiste** (`ui-bulk`, invertiert, unten mittig) federt herein: Status · Zuweisen · Priorität · Fällig · Löschen · ×. Jede Sammeländerung ist **ein** Verlaufseintrag und lässt sich per Toast rückgängig machen.

## Regeln
- Mobil scrollt die Tabelle horizontal, die Auswahl-Leiste bleibt unten.
- Leere Ergebnisse → „Keine Treffer“ mit „Filter zurücksetzen“.

## shadcn/ui + React
TanStack Table (`getSortedRowModel`, `getFilteredRowModel`, `rowSelection`), `<DropdownMenu>`/`<Command>` für Filter, eigene Zellen-Editoren.
