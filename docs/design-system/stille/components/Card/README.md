# Card

Rahmt ein Objekt (Projekt, Gebäude, Vorlage); Einstellungen und Aktionen der Karte bleiben verborgen, bis sie gehovert oder fokussiert wird.

## Markup
`<article class="ui-card ui-card--interactive ui-reveal-scope">` → `ui-card__header` (`ui-card__heading` mit `ui-card__title` + `ui-card__desc`, daneben `ui-card__actions ui-reveal`) → `ui-card__content` → `ui-card__footer`.

## Der Consumer liefert
Titel, eine Zeile Meta (`ui-card__desc`), optional Status-Badge und Zeitstempel im Footer, und die Karten-Aktionen (max. zwei Icon-Buttons; alles Weitere ins ⋯-Menü).

## Regeln
- Aktionen immer in `ui-reveal`; Status und Titel immer sichtbar.
- Ist die ganze Karte klickbar, ist der Titel der Link (`ui-row-link`), nicht die Karte – sonst kollidieren Klicks mit den Aktionen.
- Ruhezustand `shadow-sm`, bei Hover 2px Lift und `shadow-md`.
- Nicht: farbige Ränder, Icons als Deko im Kopf, mehr als eine Metazeile.

## shadcn/ui
`<Card className="group">` … `<div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">`.
