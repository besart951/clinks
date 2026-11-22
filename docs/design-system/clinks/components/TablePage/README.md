# TablePage

A list page: page header, then one DataTable with search, filters, domain actions and the footer.

## Markup

```svelte
<PageHeader title="Adressbestand" description="…" />
<DataTable definition={addressTable} rows={pagedRows(load)} rowActions={actions} />
```

## Rules

- One H1 and at most one primary text action; further page actions sit in the table toolbar or a menu.
- The row click opens the detail; secondary row actions reveal on hover and stay visible on touch.
- Applied filters show as pills under the toolbar; the footer names the count and the page size.

## Source

`page-header/`, `data-table/`
