# Select

Wählt genau einen Wert aus einer kurzen, festen Liste; daneben die Textarea für mehrzeilige Eingaben.

## Markup
Trigger `<button class="ui-select" aria-haspopup="listbox">Wert<svg class="ui-icon">chevron</svg></button>` (ohne Wert: `data-placeholder`), Liste als `ui-menu`. Mehrzeilig: `<textarea class="ui-textarea">`.

## Regeln
- Bis ~7 Optionen; darüber eine Combobox mit Suche (`Command` im Popover).
- Der Trigger zeigt immer den aktuellen Wert, nie nur ein Icon.
- Textarea wächst vertikal, Standardhöhe drei Zeilen.

## shadcn/ui
`<Select>`/`<SelectTrigger>`/`<SelectContent>`, `<Textarea>`; Combobox = `<Popover>` + `<Command>`.
