# TenantSwitcher

Selects the active company in the portal header or the sidebar, with search once the list grows.

## Markup

```svelte
import { TenantSwitcher } from '@codelinks/ui/components/tenant-switcher';
```

## Rules

- Further choices lock while a switch runs; old data is discarded.
- Without a selection it shows the translated prompt and never picks one silently.

## Source

`tenant-switcher/tenant-switcher.svelte`
