# Skeleton

Platzhalter in der Form des kommenden Inhalts, solange geladen wird.

## Markup
`<span class="ui-skeleton" style="height…;width…">` innerhalb der echten Komponente; Container `aria-busy="true"`.

## Regeln
- Form und Grösse des echten Inhalts nachbilden, damit nichts springt.
- Erst nach ~200ms zeigen; schnelle Antworten ohne Skeleton.
- Kein Spinner für Seiteninhalte; Spinner nur in Buttons während einer Aktion.

## shadcn/ui
`<Skeleton className="h-4 w-1/2">`.
