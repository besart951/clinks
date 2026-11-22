# Dialog

Unterbricht für eine Entscheidung, die nicht warten kann – meist eine Bestätigung oder ein kurzes Formular.

## Markup
`<div class="ui-overlay">` (Scrim in `overlay`) → `<div class="ui-dialog" role="dialog" aria-modal="true">` → `ui-dialog__title`, `ui-dialog__desc`, optional `ui-dialog__body`, `ui-dialog__footer` (Abbrechen links, Hauptaktion rechts).

## Der Consumer liefert
Titel als Frage, eine Beschreibung mit den konkreten Folgen, die Aktionen.

## Regeln
- Titel als Frage („Gebäude löschen?“), Hauptbutton wiederholt das Verb („Endgültig löschen“), nie „OK“/„Ja“.
- Bei grossen Folgen den Namen eintippen lassen.
- Max. 440px breit; längere Formulare gehören in ein Sheet oder eine eigene Seite.
- Fokus beim Öffnen auf das erste Feld bzw. „Abbrechen“; Esc schliesst.

## shadcn/ui
`<Dialog>` bzw. `<AlertDialog>` für Destruktives.
