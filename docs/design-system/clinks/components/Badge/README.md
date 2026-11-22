# Badge

Marks a state that differs from the normal case; StatusBadge shows it as a dot plus a word. The `count` variants are counters.

## Markup

```svelte
import { StatusBadge } from '@codelinks/ui/components/status-badge';
import { Badge } from '@codelinks/ui/components/badge';
<StatusBadge tone="warning">Paket fehlt</StatusBadge>
<Badge variant="count-primary" pulse={unread}>{unread}</Badge>
```

## Rules

- The normal state carries no badge; a badge never repeats the column header.
- StatusBadge `tone`: `neutral | info | success | warning | danger`; the word is always written.
- `count` beside tabs and filters, `count-primary` for unread items; `pulse` hops once when the value changes.

## Source

`ui/badge/badge.svelte`, `status-badge/status-badge.svelte`
