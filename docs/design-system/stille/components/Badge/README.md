# Badge

Kurzes Etikett für Status, Version oder Rolle – ein bis zwei Wörter.

## Markup
`<span class="ui-badge">` (gefüllt, `secondary`) oder `ui-badge--outline`. Status: `<span class="ui-dot ui-dot--{success|warning|destructive}"></span>` vor dem Wort.

## Regeln
- Status immer mit Wort; der Punkt ist nur Verstärkung (farbenblind-sicher).
- Keine farbig gefüllten Badges – Farbe nur im 6px-Punkt.
- Pro Objekt höchstens zwei Badges.

## shadcn/ui
`<Badge variant="secondary|outline">` mit einem `<span className="size-1.5 rounded-full bg-[var(--success)]" />`.
