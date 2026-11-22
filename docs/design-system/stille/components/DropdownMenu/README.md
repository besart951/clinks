# DropdownMenu

Sammelt alle selteneren Aktionen eines Objekts hinter dem ⋯-Button, damit die Oberfläche ruhig bleibt.

## Markup
Trigger `ui-btn--ghost ui-btn--icon` (in einem `ui-reveal`), Panel `<div class="ui-menu" role="menu">` mit `ui-menu__item`, `ui-menu__sep`, `ui-menu__item--destructive`.

## Regeln
- Solange das Menü offen ist, bleibt sein Trigger sichtbar (`is-revealed` auf dem Scope).
- Reihenfolge: häufig → selten; Löschen zuletzt, nach einem Separator, in `destructive`.
- Max. ~7 Einträge; Icons links in `muted-foreground`, Shortcuts rechts.

## shadcn/ui
`<DropdownMenu>`, `<DropdownMenuItem variant="destructive">`, `<DropdownMenuSeparator>`, `<DropdownMenuShortcut>`.
