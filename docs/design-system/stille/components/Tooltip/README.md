# Tooltip

Benennt einen Icon-Button bei Hover oder Fokus – ein bis drei Wörter, kein Satz.

## Markup
`<span class="ui-tooltip" role="tooltip">` über dem Trigger, per `aria-describedby` verknüpft.

## Regeln
- Erscheint nach ~300ms Hover oder sofort bei Fokus; nie für Inhalte, die man lesen *muss*.
- Invertiert (`primary` / `primary-foreground`), `radius-sm`, `shadow-md`.

## shadcn/ui
`<Tooltip>`, `<TooltipTrigger asChild>`, `<TooltipContent>`.
