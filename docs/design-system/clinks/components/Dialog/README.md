# Dialog

The modal layer for confirmations and short forms; below 640px it can rise as a bottom sheet.

## Markup

```svelte
import { ConfirmDialog } from '@codelinks/ui/components/confirm-dialog';
import { FormDialog } from '@codelinks/ui/components/form-dialog';
<ConfirmDialog bind:open title="Adresse löschen" description="Seestrasse 12 wird entfernt." destructive … />
```

## Rules

- Only final actions need a dialog; reversible ones run at once with an undo toast.
- The description names the target; never “Sind Sie sicher?”. Cancel first, confirm last.
- Rises 8px over `--dur-3`, leaves shorter; focus trap, Escape and focus return come from Bits UI.
- Side panels use Sheet (`@codelinks/ui/components/sheet`), sliding in from an edge.

## Source

`ui/dialog/*.svelte`, `confirm-dialog/`, `form-dialog/`, `ui/sheet/`
