# RowActions

The secondary actions of a row or card: hidden at rest, shown on hover, focus or an open menu.

## Markup

```svelte
import { RowActions } from '@codelinks/ui/components/row-actions';
<div class="reveal-parent">… <RowActions {actions} menuLabel="Aktionen" /></div>
```

## Rules

- The primary action stays the click on the row.
- At most two inline IconButtons beside a ⋯ menu; their space is reserved, nothing jumps.
- Always visible on touch and in forced colours; also reachable via context menu and Shift+F10.

## Source

`row-actions/row-actions.svelte`
