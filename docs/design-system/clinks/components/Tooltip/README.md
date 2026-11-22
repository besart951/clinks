# Tooltip

Names an icon-only control on hover and keyboard focus.

## Markup

```svelte
import * as Tooltip from '@codelinks/ui/components/tooltip';
```

## Rules

- Usually created by IconButton from its label.
- Never the only place for necessary information; on touch it may not appear.
- Grows from its trigger over `--dur-2`.

## Source

`ui/tooltip/tooltip-content.svelte`
