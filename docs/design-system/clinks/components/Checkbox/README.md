# Checkbox

A 16px box for a yes/no choice or a row selection.

## Markup

```svelte
import { Checkbox } from '@codelinks/ui/components/checkbox';
<Checkbox id="terms" bind:checked /><Label for="terms">…</Label>
```

## Rules

- Always with a visible label; the hit area extends beyond the box.
- Unchecked on `control` with an `input` border, checked in `primary`; presses to `.88` and draws the tick.

## Source

`ui/checkbox/checkbox.svelte`
