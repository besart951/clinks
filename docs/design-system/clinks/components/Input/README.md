# Input

A single-line field with a visible label above, optional help or error below. Textarea, NativeSelect and SearchField share it.

## Markup

```svelte
import { FormField } from '@codelinks/ui/components/form';
import { Input } from '@codelinks/ui/components/input';
<FormField label="Strasse" error={errors.street}>{#snippet children(attrs)}<Input {...attrs} bind:value={street} />{/snippet}</FormField>
```

## Rules

- The label is always visible; a placeholder is only an example.
- Errors appear after leaving the field or on submit, mapped to the field from the backend code.
- On `control` with an `input` outline (3:1), `ring` on focus, 36px (40px with 16px text on touch).
- No field palette in feature code.

## Source

`ui/input/control-variants.ts`, `form/form-field.svelte`, `search-field/`
