# Tabs

An underlined strip that switches between sibling views of one entity.

## Markup

```svelte
import * as Tabs from '@codelinks/ui/components/tabs';
<Tabs.Root bind:value><Tabs.List><Tabs.Trigger value="members">Mitglieder</Tabs.Trigger></Tabs.List><Tabs.Content value="members">…</Tabs.Content></Tabs.Root>
```

## Rules

- Real links (`aria-current="page"`) when each section has its own URL.
- The indicator grows from the centre; the strip scrolls on narrow screens; focus is a 2px `ring` outline drawn inside the tab so the strip never clips it.
- View options without their own content are a segmented Toggle.

## Source

`ui/tabs/*.svelte`, `ui/tabs/tab-strip.ts`
