# Button

Löst eine Aktion aus; pro Ansicht höchstens ein `ui-btn--primary`, alles andere ruhiger.

## Markup
`<button class="ui-btn ui-btn--{primary|secondary|outline|ghost|destructive}">` – optional `ui-btn--sm` (32px), `ui-btn--icon` (quadratisch). Ein Lucide-Icon (16px, `ui-icon`) steht vor dem Text.

## Regeln
- Verb zuerst, Satzanfang gross: „Projekt erstellen“.
- `ghost` + `ui-btn--muted` ist der Standard für versteckte Werkzeug-Buttons (⋯, Kopieren, Bearbeiten) in `ui-reveal`.
- Icon-only immer mit `aria-label` und Tooltip.
- `destructive` nur in Bestätigungsdialogen; in Menüs stattdessen `ui-menu__item--destructive`.
- Nicht: zwei Primärbuttons nebeneinander, Icons ohne Text als einzige Hauptaktion.

## shadcn/ui
`<Button variant="default|secondary|outline|ghost|destructive" size="default|sm|icon">`.
