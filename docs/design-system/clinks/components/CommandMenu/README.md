# CommandMenu

The ⌘K / Ctrl+K search for pages and actions; Portal and Admin use it as their page search.

## Markup

```svelte
import { CommandMenu, CommandMenuTrigger } from '@codelinks/ui/components/command-menu';
<CommandMenuTrigger label="Schnellsuche" placeholder="Seiten, Workspaces …" onclick={() => (open = true)} />
<CommandMenu bind:open {groups} {labels} />
```

## Rules

- Every action hidden behind a hover is reachable here too.
- Items: `label`, `run`, optional `icon`, `product`, `description`, `status`, `href` (⌘/Ctrl click opens a new tab).
- Combobox with options: ↑ ↓ Enter Esc; focus returns to the trigger. ⌘K is ignored while another dialog is open.

## Source

`command-menu/*.svelte`
