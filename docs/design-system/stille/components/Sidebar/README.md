# Sidebar

Die feste Hauptnavigation links: wenige Bereiche oben, die Projekte des Nutzers darunter, Einstellungen unten.

## Markup
`<nav class="ui-sidebar">` mit `ui-sidebar__group`s. Gruppentitel `ui-sidebar__label`, Einträge `ui-nav-item` (aktiv: `aria-current="page"`). Hinzufügen-Button im Titel und ⋯ pro Eintrag sind `ui-reveal`; Titelzeile bzw. Eintrag ist der `ui-reveal-scope` (nie die ganze Gruppe, sonst erscheinen alle ⋯ gleichzeitig).

## Regeln
- 240px breit, ohne Hintergrundfarbe, getrennt durch eine `border`-Linie.
- Icons nur für die festen Bereiche oben; Projekte bekommen ein neutrales Ordner-Icon.
- Zähler nur für offene Aufgaben, in `muted-foreground`, nie als farbiger Kreis.
- Einklappbar auf 56px (nur Icons, Labels als Tooltip).

## shadcn/ui
`<Sidebar>`, `<SidebarGroupLabel>` + `<SidebarGroupAction>`, `<SidebarMenuItem>` + `<SidebarMenuAction showOnHover>`.
