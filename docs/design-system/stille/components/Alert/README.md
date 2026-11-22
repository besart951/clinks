# Alert

Ein dauerhafter Hinweis im Seitenfluss, der etwas über den aktuellen Zustand sagt.

## Markup
`<div class="ui-alert ui-alert--{warning|destructive}">` → Icon → `ui-alert__title` + `ui-alert__desc`. Fehler `role="alert"`, sonst `role="note"`.

## Regeln
- Farbe nur im Icon (und beim Fehler im Titel); Fläche bleibt `card`.
- Höchstens ein Alert pro Seite, oberhalb des betroffenen Inhalts.
- Vorübergehende Rückmeldungen sind Toasts, keine Alerts.

## shadcn/ui
`<Alert variant="default|destructive">`, `<AlertTitle>`, `<AlertDescription>`.
