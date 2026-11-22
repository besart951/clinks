# Pagination

Blättert durch lange Tabellen; steht unter der Tabelle.

## Markup
`<nav class="ui-pagination">` → Bereichsangabe („1–20 von 148“) → `ui-pagination__pages` mit Icon-Buttons; aktuelle Seite `aria-current="page"`.

## Regeln
- Erst ab mehr als einer Seite anzeigen.
- Max. sieben Seitenknöpfe inkl. „…“.
- Unter 200 Einträgen lieber endlos laden oder alles zeigen und filtern.

## shadcn/ui
`<Pagination>`, `<PaginationLink isActive>`, `<PaginationEllipsis>`.
