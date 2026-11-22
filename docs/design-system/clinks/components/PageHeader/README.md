# PageHeader

The page's only H1, with an optional back link, consequence line and actions; SectionHeader is the H2.

## Markup

```svelte
import { PageHeader, SectionHeader } from '@codelinks/ui/components/page-header';
<PageHeader title="Adressen"><Button>Adresse erfassen</Button></PageHeader>
```

## Rules

- Exactly one H1 and at most one primary text action per page; further actions are IconButtons or a menu.
- A description only for a consequence or limit visible nowhere else.
- `page-title` 30px, 24px below 640px.

## Source

`page-header/*.svelte`
