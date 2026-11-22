# OverviewPage

Die Startseite eines Projekts: wie weit es ist, was brennt, was mich betrifft und was zuletzt passiert ist.

## Aufbau
- **Kennzahlen** (`ov__tile`, 4 nebeneinander, mobil 2 × 2): Erledigt in % mit Fortschrittsbalken in `success`, Offen, Überfällig (Zahl in `destructive`, sobald > 0), Diese Woche fällig. Jede Kachel: Label in `muted-foreground`, Zahl 28px/600 tabellarisch, eine Zeile Kontext.
- **Fortschritt pro Spalte** (`ov__bars`): ein Balken je Spalte in einer einzigen Farbe (`primary`), Länge relativ zur grössten Spalte, Name links (mit Spaltenfarbe als Punkt, falls gesetzt), Anzahl rechts. Hover zeigt einen Tooltip mit Anzahl und Anteil. Bewusst kein gestapelter Mehrfarben-Balken: die Spalten sind beschriftet, Farbe trägt keine Bedeutung.
- **Überfällig** und **Meine Aufgaben** als kompakte Listen (`ui-mini`: ID, Titel, Fälligkeit, Avatar), max. 6 Einträge, Link zur vollen Ansicht.
- **Letzte Aktivität**: die 6 neuesten Einträge aus dem Verlauf.

## Motion
Kacheln und Karten steigen beim Öffnen gestaffelt ein (50ms), Balken wachsen von links (`ov-grow`). Live-Updates ändern nur Zahlen und Balkenlängen (Breite gleitet), ohne erneutes Einsteigen.

## Regeln
- Nur Zahlen, die zu einer Handlung führen; keine Deko-Statistiken.
- Leeres Projekt → EmptyState mit „Aufgabe erstellen“.
