# BoardPage

A page of records grouped by state, one column per state; InfraLink shows its projects by phase.

## Markup

```svelte
<ToggleGroup.Root type="single" variant="segmented" aria-label="Ansicht" bind:value={view}>…</ToggleGroup.Root>
<KanbanBoard columns={phaseColumns} labels={…} onMove={(move) => saveProjectPhase(move.cardId, move.to)}>
  {#snippet card(item)}<a href={item.href}>{item.title}</a>{/snippet}
</KanbanBoard>
```

## Rules

- A view switch (List/Board) as a segment control; filters that the columns replace (phase) are hidden on the board.
- Moving a card is a real save with the expected version; the board only reports the move.
- Every move is also in the card's ⋯ menu, so it works by keyboard and touch; columns are `muted`, cards `card` with `shadow-sm` and glide to their new place.
- Column headings follow the page outline (`headingLevel`), usually `h2` below the page title.

## Source

`app/web/infralink/src/lib/features/projects/ui/ProjectsPage.svelte`, `kanban-board/`
