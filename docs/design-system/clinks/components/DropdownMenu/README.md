# DropdownMenu

The floating list of actions behind a trigger, usually the ⋯ IconButton.

## Markup

```svelte
import * as DropdownMenu from '@codelinks/ui/components/dropdown-menu';
```

## Rules

- The primary action stays a visible button; secondary actions go here.
- Destructive items come last, after a separator.
- Items 32px, 44px on touch; the menu grows from its trigger over `--dur-2`.

## Source

`ui/dropdown-menu/*.svelte`
