# Checkbox

Wählt eine Option in einem Formular, das mit „Speichern“ bestätigt wird; auch für Mehrfachauswahl in Tabellen.

## Markup
`<span class="ui-check" role="checkbox" aria-checked="true|false|mixed" tabindex="0"><span class="ui-check__box"><svg class="ui-icon">…check…</svg></span>Label</span>` – oder ein natives `<input type="checkbox">` mit denselben Klassen am Label.

## Regeln
- Label rechts, klickbar über die ganze Zeile.
- In Tabellen: Auswahl-Spalte erscheint erst, wenn eine Zeile gehovert oder schon etwas ausgewählt ist – danach bleibt sie für alle Zeilen sichtbar.
- Sofort wirksame Einstellungen sind ein `ui-switch`, keine Checkbox.

## shadcn/ui
`<Checkbox>` + `<Label>`.
