# Toast

Confirms briefly that something happened, bottom right, gone after about 5 seconds.

## Markup

```svelte
import { Toaster, ToastService } from '@codelinks/ui/components/sonner';
toasts.undoable('addresses.archived', () => restore(id)); // toasts: the app's ToastService
```

## Rules

- A short past-tense phrase: “Vorlage kopiert”; no “Erfolgreich!”.
- Reversible actions offer “Rückgängig” instead of a confirm dialog.
- Errors stay until closed; at most three at once. Toasts spring in over `--dur-3`.

## Source

`ui/sonner/*`
