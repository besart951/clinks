# Avatar

A round person marker: photo, or initials on `muted`.

## Markup

```svelte
import * as Avatar from '@codelinks/ui/components/avatar';
<Avatar.Root size="sm"><Avatar.Image src={url} alt={name} /><Avatar.Fallback>AK</Avatar.Fallback></Avatar.Root>
```

## Rules

- Always put the name next to it; the avatar alone never identifies anyone.
- Sizes 24, 32 and 40px; fallbacks stay `muted`, never coloured.

## Source

`ui/avatar/*.svelte`
