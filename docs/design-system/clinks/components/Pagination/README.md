# Pagination

A row of page buttons; DataTable pages its own lists.

## Markup

```svelte
import * as Pagination from '@codelinks/ui/components/pagination';
```

## Rules

- Prefer the DataTable footer (count, rows per page, previous/next).
- Cursor lists load more instead of inventing a page count.

## Source

`ui/pagination/*.svelte`
