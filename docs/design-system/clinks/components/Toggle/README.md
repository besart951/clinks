# Toggle

A button that stays pressed; ToggleGroup with `variant="segmented"` is the Stille segment control.

## Markup

```svelte
import * as ToggleGroup from '@codelinks/ui/components/toggle-group';
<ToggleGroup.Root type="single" variant="segmented" aria-label="Ansicht" value={view} onValueChange={(v) => v && (view = v)}>
  <ToggleGroup.Item value="day">Tag</ToggleGroup.Item><ToggleGroup.Item value="week">Woche</ToggleGroup.Item>
</ToggleGroup.Root>
```

## Rules

- Segments for views and filters (Tag/Woche, Alle/Hinweise); the chosen one lifts onto `card`.
- A single choice is a radio group; switching whole content panels is Tabs.
- Persistent settings use a Checkbox in a form.

## Source

`ui/toggle/toggle.svelte`, `ui/toggle-group/*.svelte`
