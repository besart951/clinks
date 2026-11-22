# Sidebar

The fixed main navigation of the StaffShell (Portal, Admin and the product apps): fixed areas at the top, grouped sections below, settings at the bottom.

## Markup

```svelte
import { StaffShell, StaffNavigation } from '@codelinks/ui/components/staff-shell';
<StaffShell theme="service" {destinations} brandLabel="CLinks" {title}>
  {#snippet navigation()}<StaffNavigation {groups} {pathname} label="Hauptnavigation" />{/snippet}
</StaffShell>
```

## Rules

- 240px wide, no fill of its own: it sits on the page ground, separated by a `border` line. Collapsible to 56px (icons only, labels as tooltips); a drawer below 768px.
- Rows are 32px (44px on touch) in `muted-foreground`; hover and the current page sit on neutral `sidebar-accent`, the current page in `foreground` and weight 500. Only the focus ring takes the action colour.
- Group titles 28px, `caption` in `muted-foreground`. An add button in the title and ⋯ per entry are revealed on hover (`reveal-parent` on the title row or the entry, never the whole group).
- Icons for the fixed areas; counters only for open work, in `muted-foreground`, never a coloured circle.
- Real links, so modified clicks keep browser behaviour. The app switcher above leads each entry with a tile in its product colour.

## Source

`staff-shell/*.svelte`, `ui/sidebar/`, `staff-theme.css`
