# DataTable

The one list for tabular records: search, filters, sorting, columns, density, paging and loading, empty and error states; a flat list on phones.

## Markup

```svelte
import { DataTable } from '@codelinks/ui/components/data-table';
<DataTable definition={addressTable} rows={pagedRows(load)} rowActions={actions} />
```

## Rules

- The row click opens the detail; no separate “Öffnen” column.
- Secondary actions in RowActions; numbers right-aligned in tabular figures.
- Server lists load with the shared `ListQuery`; never filter only the visible page.
- The plain `Table` primitive is only for small static tables.

## Source

`data-table/ui/*.svelte`, `ui/table/*.svelte`
