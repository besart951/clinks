# Card

Groups related content on `card` with a 1px `border` and `shadow-sm`.

## Markup

```svelte
import * as Card from '@codelinks/ui/components/card';
<Card.Root><Card.Header><Card.Title>…</Card.Title><Card.Action>…</Card.Action></Card.Header><Card.Content>…</Card.Content></Card.Root>
```

## Rules

- 24px padding (`sm` 16px), `radius-lg`; a card inside a card turns `muted`, never deeper.
- Single values belong in a list, not a card each.
- No wider shadows, coloured borders or decorative headers.

## Source

`ui/card/*.svelte`
