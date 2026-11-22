# Accordion

Stacks optional detail that expands inside one bordered panel.

## Markup

```svelte
import * as Accordion from '@codelinks/ui/components/accordion';
<Accordion.Root type="single"><Accordion.Item value="a"><Accordion.Trigger>…</Accordion.Trigger><Accordion.Content>…</Accordion.Content></Accordion.Item></Accordion.Root>
```

## Rules

- Only for optional detail; anything a person must read stays visible.
- Triggers are `label` text with a 16px chevron; an open item tints to `muted`.
- Collapsible is the unstyled single-section behaviour behind it.

## Source

`ui/accordion/*.svelte`
