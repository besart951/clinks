# DataTable

Listet viele gleichartige Objekte; Spaltenköpfe zeigen nur den Namen, Sortier- und Filter-Icons erscheinen beim Hover über dem jeweiligen Kopf, Zeilenaktionen beim Hover über der Zeile.

## Markup
`<div class="ui-table-wrap"><table class="ui-table">`. Jeder sortier-/filterbare Kopf: `<th class="ui-reveal-scope"><div class="ui-th"><span class="ui-th__label">…</span><span class="ui-th__tools ui-reveal">…</span></div></th>`. Jede Zeile: `<tr class="ui-reveal-scope">`, letzte Zelle `ui-td-actions` mit `ui-row-actions ui-reveal`.

## Der Consumer liefert
Spalten (Label, sortierbar?, filterbar?), Zeilen, pro Zeile max. eine direkte Aktion plus ⋯-Menü.

## Regeln
- Ein aktiv sortierter oder gefilterter Kopf zeigt sein Icon **dauerhaft** (Klasse `is-revealed` auf dem `th`) – ein aktiver Zustand darf nie versteckt sein.
- IDs, IPs, Zahlen in `ui-mono`, Zahlen rechtsbündig.
- Status als `ui-badge--outline` mit Punkt + Wort.
- Zeilen-Hover in `accent`; keine Zebra-Streifen, keine vertikalen Linien.
- Leere Tabelle: ein Satz + eine Aktion, mittig in `muted-foreground`.

## shadcn/ui
`<Table>` (oder TanStack-`DataTable`); `<TableHead className="group">` und `<TableRow className="group">`, Werkzeuge mit `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100`.
