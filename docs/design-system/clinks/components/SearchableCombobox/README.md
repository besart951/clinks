# SearchableCombobox

A searchable single-value picker for long lists; the multi variant shows chips.

## Markup

```svelte
import { SearchableCombobox } from '@codelinks/ui/components/searchable-combobox';
```

## Rules

- Use it instead of Select once a list needs searching or exceeds a screen.
- Options may carry a description; asynchronous sources show loading and errors.
- In grid cells it opens on typing, not on focus.

## Source

`searchable-combobox/`, `searchable-multi-combobox/`
