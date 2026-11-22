# Alert

A message about a whole page or section: a missing prerequisite, a failed connection, an active support session.

## Markup

```svelte
import * as Alert from '@codelinks/ui/components/alert';
<Alert.Root variant="destructive"><Icon /><Alert.Title>…</Alert.Title><Alert.Description>…</Alert.Description></Alert.Root>
```

## Rules

- Field errors stay on the field, confirmations are toasts.
- `default` on `card`, `destructive` in `destructive` text; one 16px icon at most.
- SupportAccessBanner is the one tinted, sticky variant.

## Source

`ui/alert/*.svelte`, `support-access-banner/`
