# Button

Triggers an action; at most one `default` (primary) button per view, everything else quieter.

## Markup

```svelte
import { Button } from '@codelinks/ui/components/button';
import { IconButton } from '@codelinks/ui/components/icon-button';
<Button>Speichern</Button>  <Button variant="outline">Abbrechen</Button>
<IconButton label="Bearbeiten"><Pencil /></IconButton>
```

## Rules

- Variants `default | outline | secondary | ghost | destructive | link`; sizes 36px (`sm` 32, `xs` 28), 40px on touch.
- Verb first: “Projekt erstellen”. Icon-only actions are IconButtons with a label and tooltip.
- `destructive` is a tint, never a red block, and pairs with a ConfirmDialog.
- No raw `<button>` in app code; tenants and products recolour `primary`, apps never colour buttons.

## Source

`ui/button/button.svelte`, `icon-button/icon-button.svelte`
