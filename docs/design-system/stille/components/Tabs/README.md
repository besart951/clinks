# Tabs

Wechselt zwischen gleichrangigen Ansichten desselben Objekts.

## Markup
`<div class="ui-tabs" role="tablist">` mit `<button class="ui-tab" role="tab" aria-selected>`.

## Regeln
- Linie statt Segment-Kasten: aktiver Tab `foreground` + 2px `primary`-Unterstrich, Rest `muted-foreground`.
- 2–6 Tabs, je ein Wort; keine Icons, keine Zähler ausser bei echten Aufgaben.

## shadcn/ui
`<Tabs>`, `<TabsList className="bg-transparent border-b rounded-none">`, `<TabsTrigger>` mit Unterstrich-Styling via `data-[state=active]`.
