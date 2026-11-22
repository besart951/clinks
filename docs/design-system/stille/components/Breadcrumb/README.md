# Breadcrumb

Zeigt, wo in der Hierarchie (Projekt → Gebäude → Schaltschrank) man sich befindet, und führt zurück.

## Markup
`<ol class="ui-breadcrumb">` mit Links, `ui-breadcrumb__sep` („/“), letzter Eintrag `aria-current="page"` ohne Link.

## Regeln
- Steht über dem Seitentitel, nicht statt ihm.
- Ab fünf Ebenen die mittleren zu „…“ (Menü) zusammenfassen.

## shadcn/ui
`<Breadcrumb>`, `<BreadcrumbSeparator>/</BreadcrumbSeparator>`, `<BreadcrumbEllipsis>`.
