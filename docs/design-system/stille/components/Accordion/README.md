# Accordion

Gruppiert Attribute nach Domäne und lässt jede Gruppe auf- und zuklappen; mehrere dürfen gleichzeitig offen sein.

## Markup
`<div class="ui-accordion">` → `<section class="ui-accordion__item [is-open]">` → `ui-accordion__head` mit `<button class="ui-accordion__trigger" aria-expanded>` (Chevron, Name, `ui-accordion__count`) → `ui-accordion__content > div > ui-accordion__inner` mit `ui-attr`-Zeilen und `ui-attr-add`.

## Regeln
- Kopf zeigt immer die Anzahl; Inhalt klappt über `grid-template-rows` (keine festen Höhen).
- Der Chevron sitzt rechts und erscheint nur bei Hover über dem Kopf oder Tastaturfokus (auf Touch immer); Name und Anzahl bleiben stehen, nichts verschiebt sich.
- Entfernen-× und Hinzufügen nur in offenen Gruppen; × erscheint bei Hover/Fokus.
- Nicht für Navigation oder Fliesstext – dafür Tabs bzw. Seiten.

## shadcn/ui
`<Accordion type="multiple">`, `<AccordionItem>`, `<AccordionTrigger>`, `<AccordionContent>`.
