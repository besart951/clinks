# EmptyState

Says in one sentence why a list or section is empty and offers at most one action.

## Markup

```svelte
import { EmptyState } from '@codelinks/ui/components/empty-state';
<EmptyState message="Keine Adressen gefunden." />
<EmptyState icon={Handshake} title="Noch keine Partner" description="…"><Button>Partner hinzufügen</Button></EmptyState>
```

## Rules

- `message`: one muted line inside lists and tables. `title` + `description`: the block for an empty section.
- No illustrations, jokes or exclamation marks.
- Empty search results in menus stay a plain line: “Keine Treffer für …”.

## Source

`empty-state/empty-state.svelte`
