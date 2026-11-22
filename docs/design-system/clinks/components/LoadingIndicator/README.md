# LoadingIndicator

The animated CLinks mark that replaces every spinner; LoadingStatus is its form for loading content.

## Markup

```svelte
import { LoadingIndicator, LoadingStatus } from '@codelinks/ui/components/loading-indicator';
<LoadingStatus label="Wird geladen …" />
<Button disabled>{#if saving}<LoadingIndicator />{/if}Speichern</Button>
```

## Rules

- LoadingStatus announces at once and shows the mark only after 300ms, so fast answers never flash.
- Spinners only inside buttons during an action; content-shaped placeholders use Skeleton.
- Under reduced motion it shows the complete mark without motion.

## Source

`loading-indicator/*.svelte`
