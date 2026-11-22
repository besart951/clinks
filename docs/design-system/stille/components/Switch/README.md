# Switch

Schaltet eine Einstellung sofort an oder aus – ohne Speichern-Button.

## Markup
`<button class="ui-switch" role="switch" aria-checked="true|false">` mit sichtbarem Label daneben oder `aria-label`.

## Farben
Aus: weisser Knopf (`switch-thumb`) auf grauer Spur (`input`). An: Spur `primary`, Knopf `primary-foreground`.

## Regeln
- Nur für sofort wirksame Booleans; in Formularen mit „Speichern“ stattdessen Checkbox.
- Label beschreibt den An-Zustand („Benachrichtigungen“, nicht „Benachrichtigungen aus“).

## shadcn/ui
`<Switch>`.
