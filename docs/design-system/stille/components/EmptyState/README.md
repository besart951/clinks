# EmptyState

Erklärt in einem Satz, warum eine Liste leer ist, und bietet genau eine Aktion an.

## Markup
`<div class="ui-empty">` → `ui-empty__icon` (ein Lucide-Icon im Rahmen) → `ui-empty__title` → `ui-empty__desc` → ein Button.

## Regeln
- Titel sagt, was fehlt („Noch keine Gebäude“), Beschreibung, was man davon hat.
- Keine Illustrationen, keine Witze, kein Ausrufezeichen.
- Leere Suchergebnisse: „Keine Treffer für ‚…‘“ + „Filter zurücksetzen“, ohne Rahmen.

## shadcn/ui
Eigenes Muster aus `div` + `<Button>` (bzw. `<Empty>` in neueren shadcn-Versionen).
