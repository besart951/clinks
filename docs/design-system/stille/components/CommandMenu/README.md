# CommandMenu

Die Abkürzung für alles: ⌘K öffnet eine Suche über Projekte, Objekte und Befehle – so kann die restliche Oberfläche ruhig bleiben.

## Markup
`<div class="ui-command">` → `ui-command__search` (Icon, Eingabe, `ui-kbd`) → `ui-command__list` mit `ui-command__group`-Titeln und `ui-menu__item`-Einträgen.

## Regeln
- Jede Aktion, die in der UI hinter einem Hover steckt, ist hier auch auffindbar.
- Ergebnisse gruppiert: zuletzt besucht, Objekte, Aktionen. Shortcuts rechts.
- Pfeiltasten bewegen `is-active`, Enter führt aus.

## shadcn/ui
`<CommandDialog>`, `<CommandInput>`, `<CommandGroup heading>`, `<CommandItem>`, `<CommandShortcut>`.
