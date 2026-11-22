# Skeleton

A placeholder shaped like the content that is loading.

## Markup

```svelte
import { Skeleton } from '@codelinks/ui/components/skeleton';
<div aria-busy="true"><Skeleton class="h-4 w-1/2" /></div>
```

## Rules

- Mirror the real layout so nothing jumps; DataTable draws its own skeleton rows.
- Pulses only without reduced motion.

## Source

`ui/skeleton/skeleton.svelte`
