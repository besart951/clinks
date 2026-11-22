# FilterBar

Result filters as pills: remove, field, optional operator and value, which opens an anchored editor.

## Markup

```svelte
import { FilterBar } from '@codelinks/ui/components/filters';
```

## Rules

- Text and ranges apply with “Anwenden”; selects and checkboxes apply at once.
- Removing a filter never touches search, sorting or selection.
- Applied pills tint to `primary` at 9%; on touch every pill is at least 40px.

## Source

`filters/filter-bar.svelte`
