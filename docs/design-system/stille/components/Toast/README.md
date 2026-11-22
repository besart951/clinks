# Toast

Bestätigt kurz und unaufdringlich, dass etwas passiert ist – unten rechts, verschwindet nach ~5s.

## Markup
`<div class="ui-toast" role="status">` → `ui-toast__text` (Titel + optional `ui-toast__desc`) → optional eine Aktion. Schliessen-Button als `ui-reveal`.

## Regeln
- Ein Satzteil im Perfekt: „Vorlage kopiert“. Keine „Erfolgreich!“-Floskeln.
- Bei umkehrbaren Aktionen „Rückgängig“ statt Bestätigungsdialog.
- Fehler bleiben stehen, bis sie geschlossen werden, und haben einen Status-Punkt + Wort.
- Max. drei gleichzeitig, gestapelt.

## shadcn/ui
`sonner` (`toast("Vorlage kopiert", { action: { label: "Rückgängig" } })`).
