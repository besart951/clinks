# Input

Einzeiliges Textfeld mit Label oben, optional Hilfe- oder Fehlertext darunter.

## Markup
`<div class="ui-field"><label class="ui-label">…</label><input class="ui-input">…<span class="ui-help">…</span></div>`. Fehler: `aria-invalid="true"` + `ui-help--error`. Mit Icon: `ui-input-group`.

## Regeln
- Label immer sichtbar – Placeholder ist nur ein Beispiel, nie das Label.
- Hilfetext nur, wenn er etwas erklärt; sonst weglassen (Minimalismus).
- Fehler erst nach dem Verlassen des Felds oder beim Absenden zeigen, als ganzer Satz.
- Kontur `input` (3:1), Fokus `ring`.

## shadcn/ui
`<Label>` + `<Input>`; mit react-hook-form `<FormField>` / `<FormMessage>`.
