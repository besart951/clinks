# SettingsList

Zeigt Einstellungen als ruhige Zeilen: Label, eine Hinweiszeile, der aktuelle Wert – der Bearbeiten-Button erscheint erst bei Hover oder Fokus.

## Markup
`<div class="ui-list">` mit `<div class="ui-list__row ui-reveal-scope">` → `ui-list__text` (`ui-list__label`, `ui-list__hint`) → `ui-list__value` → Icon-Button `ui-reveal`.

## Der Consumer liefert
Label, kurzer Hinweis, aktueller Wert, Bearbeiten-Handler (öffnet Inline-Edit oder Dialog).

## Regeln
- Der **Wert** ist immer sichtbar – versteckt wird nur das Werkzeug.
- Binäre Einstellungen sind ein `ui-switch` und immer sichtbar (der Switch ist der Wert).
- Gruppen mit `text-heading` überschreiben, Abstand `space-8` zwischen Gruppen.
- Gefährliche Einstellungen (Projekt löschen) in eine eigene Gruppe am Ende, mit `ui-btn--outline` und Bestätigungsdialog.

## shadcn/ui
Eigene Zeile aus `div` + `<Button variant="ghost" size="icon">` mit `group`/`group-hover:opacity-100`; `<Switch>` für Booleans.
