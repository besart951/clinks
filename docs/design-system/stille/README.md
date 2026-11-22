Stille ist ein minimalistisches, an **shadcn/ui** angelehntes System: neutrale Zink-Palette, Geist, feine Haarlinien, kaum Schatten. Das Grundprinzip heisst **Progressive Disclosure** – im Ruhezustand zeigt die Oberfläche nur Inhalt; Bedienelemente (Kartenmenüs, Sortier- und Filter-Icons in Tabellenköpfen, Zeilenaktionen, Bearbeiten-Stifte in Einstellungen) erscheinen erst bei Hover oder Tastaturfokus.

## Grundregeln

- **Inhalt zuerst, Werkzeuge bei Bedarf.** Jede sekundäre Aktion, die zu einem Element gehört (⋯-Menü, Kopieren, Bearbeiten, Löschen, Sortieren, Filtern), ist ein `ui-reveal` innerhalb eines `ui-reveal-scope`. Immer sichtbar bleiben nur: die Primäraktion der Seite, Navigation, Formularfelder und Statusangaben.
- **Ausblenden heisst `opacity: 0`, nie `display: none`.** So springt das Layout nicht, und die Elemente bleiben per Tab erreichbar: `:focus-within` blendet sie ebenfalls ein.
- **Touch zeigt alles.** Unter `@media (hover: none)` sind alle `ui-reveal` sichtbar. Nie eine Funktion bauen, die nur per Hover existiert.
- **Eine Primäraktion pro Ansicht** (`ui-btn--primary`). Alles andere `ghost`, `outline` oder `secondary`.
- **Drei Ebenen, klar getrennt.** Seite auf `background` (reinweiss; Board-Spalten liegen vertieft auf `sunken`) → Karten, Tabellen, Listen auf `card` mit `border` und `shadow-sm` → schwebende Ebenen auf `popover` mit `shadow-md`. Interaktive Karten wechseln bei Hover auf `shadow-md`.
- **Keine Dekoration.** Keine Verläufe, keine farbigen Kartenränder, keine Emojis, keine Illustrationen als Füllmaterial.

## Inhalt & Tonalität

- Deutsch, Sie-Form vermeiden: direkt und neutral („Projekt erstellen“, nicht „Erstellen Sie ein Projekt“).
- Satzanfang gross, Rest klein: „Neues Gebäude“, nicht „Neues Gebäude Hinzufügen“.
- Buttons beginnen mit dem Verb: „Speichern“, „Einladen“, „Vorlage kopieren“.
- Leere Zustände: ein Satz, was fehlt, plus eine Aktion. Kein Ausrufezeichen.
- Zahlen, IDs und Adressen in `text-code` (Geist Mono, tabellarisch).

## Farbe

- Seite auf `background`, Text in `foreground`, Nebentext in `muted-foreground`.
- Karten auf `card` mit 1px `border` und `shadow-sm`; Menüs/Popover auf `popover` mit `border` und `shadow-md`.
- Eingabefelder, Selects, Checkboxen und Outline-Buttons haben eine eigene Füllung `field` (hell: weiss auf getönter Seite; dunkel: eine Stufe neben `background`), Kontur `input`, `shadow-sm`; bei Hover dunkelt die Kontur auf `muted-foreground` nach.
- Hover-Flächen (Zeilen, Menüpunkte, Ghost-Buttons) in `accent`.
- Steuerelement-Konturen (Input, Outline-Button, Checkbox, Switch aus) in `input`, nicht in `border` – sie brauchen 3:1.
- Status nur mit Wort: Punkt in `success` / `warning` / `destructive` + Label in `foreground`. Farbe trägt nie allein Bedeutung.
- Dialoge und Sheets liegen über einem Scrim in `overlay`; Menüs und Popover nie.
- `destructive` nur für Löschen und Fehler; Lösch-Aktionen stehen in Menüs zuletzt, abgetrennt durch einen Separator.
- Das System ist bewusst farblos. Eine Markenfarbe, falls nötig, ersetzt nur `primary` / `primary-foreground` und `ring`.

## Typografie

- Eine Familie: **Geist** (`--font-sans`), dazu **Geist Mono** (`--font-mono`), beide von Google Fonts: `https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap`.
- Seitentitel `text-display` (einmal pro Seite), Abschnitte `text-title`, Karten `text-heading`, Fliesstext und Tabellen `text-body`, Labels/Buttons/Spaltenköpfe `text-label`, Meta `text-caption` in `muted-foreground`.
- Nur drei Gewichte: 400, 500, 600. Nie fett (700) und nie kursiv für Hervorhebung – Hervorhebung über `foreground` vs. `muted-foreground`.

## Abstände, Radien, Layout

- 4px-Raster: `space-1` … `space-12`. Kartenpadding `space-6`, Kartenabstand `space-4`, Abschnitte `space-8`.
- Steuerelemente 36px hoch (klein: 32px), Icon-Buttons quadratisch.
- Radien: Buttons/Inputs `radius-md`, Karten/Popover `radius-lg`, Badges/Menüpunkte `radius-sm`, Switch/Punkte `radius-full`.
- Inhalt max. 1200px breit, linksbündig; viel Weissraum statt Rahmen um Gruppen.

## Bewegung

Alles bewegt sich, nichts springt – aber Bewegung erklärt nur, woher etwas kommt und wohin es geht. Sie ist nie Dekoration.

- **Dauer:** `--dur-1` 120ms (Hover, Drücken, Farbe) · `--dur-2` 200ms (Reveals, Menüs, Tooltips) · `--dur-3` 320ms (Dialoge, Sheets, Toasts, Layout-Verschiebungen). Nie länger als 400ms.
- **Easing:** `--ease-out` für alles, was erscheint oder reagiert; `--ease-in` für Austritte (kürzer als der Eintritt); `--ease-spring` nur für Umschalter und abgelegte Karten.
- **Reveal:** versteckte Werkzeuge blenden ein und gleiten 4px von ihrer Seite herein.
- **Drücken:** Buttons `scale(.97)`, Checkboxen `scale(.88)`; Icon-Buttons wachsen bei Hover um 8 %.
- **Hover:** interaktive Karten heben sich 2px mit `shadow-sm` und Kontur in `input`.
- **Schwebende Ebenen** (Menü, Command, Tooltip) wachsen aus ihrem Auslöser: Fade + 4px + `scale(.97)`. Dialoge steigen 8px auf, Sheets gleiten von rechts, Toasts federn von unten. Austritt mit `.is-leaving`.
- **Listen** erscheinen gestaffelt: `.ui-stagger`, jedes Kind mit `--i` (0, 1, 2 …), 40ms Abstand.
- **Layout-Änderungen** (Sortieren, Filtern, Drag & Drop) laufen über FLIP: Position merken, DOM ändern, vom alten zum neuen Platz gleiten (siehe KanbanPage). In React: dnd-kit bzw. `motion` mit `layout`.
- **Zustände:** Tab-Indikator wächst aus der Mitte, Switch-Knopf federt und streckt sich beim Drücken, Häkchen wird gezeichnet, ungültige Eingaben schütteln einmal kurz, Zähler hüpfen bei Änderung.
- `prefers-reduced-motion: reduce` schaltet alles auf sofort – Zustände wechseln weiterhin, nur ohne Weg.
- Fokus: `outline: 2px solid var(--ring); outline-offset: 2px` auf jedem fokussierbaren Element, nur bei `:focus-visible`.
- Disabled: `opacity: .5`, `cursor: not-allowed`, kein Hover-Effekt, keine Bewegung.
- Scrollbars: 6px, ohne Spur und Pfeile, Daumen in `scrollbar` – nur sichtbar, solange der scrollbare Bereich gehovert wird.

## Daten & Zusammenarbeit

- Alles, was jemand ändert, wird gespeichert und erscheint bei allen anderen live – ohne Neuladen. Fremde Änderungen gleiten an ihren Platz (FLIP), sie springen nie.
- Jede Änderung erzeugt einen Verlaufseintrag mit Person, Zeit und Vorher/Nachher; „Zurücksetzen“ schreibt einen neuen Eintrag.
- Personen werden über ihre Kennung gespeichert, Namen erst beim Anzeigen aufgelöst.
- Während jemand tippt, zieht oder ein Menü offen hat, wird die Ansicht nicht neu aufgebaut; Updates warten bis zum Ende der Handlung.
- Ohne Schreibrechte: Eingaben werden ausgeblendet, ein Hinweis „Nur Lesen“ steht neben dem Titel. Ohne Datenbank (Vorschau) läuft die App mit Demodaten und sagt das.
- Erwähnungen (`@`) und Zuweisungen landen in der Inbox der betroffenen Person.

## Responsiv & Touch

- Jede Seite funktioniert ab 360px Breite; auf dem Handy wird umgebaut, nicht verkleinert – keine Funktion fällt weg.
- **≤ 900px:** Sidebar als Schublade hinter dem Menü-Knopf der Topbar (56px, sticky).
- **≤ 760px:** Breadcrumb aus, Seitentitel 24px, Werkzeugleisten brechen um (Suche volle Breite), Tabs und Segment-Leisten werden wischbar, das Board zeigt eine Spalte pro Bildschirm mit Scroll-Snap, das Aufgaben-Detail öffnet im Vollbild von unten, Dialog-Buttons und Toasts nehmen die volle Breite.
- **Touch (`pointer: coarse`):** Tippflächen mindestens 40px (Listenzeilen 44px, Accordion-Köpfe 48px); Eingaben in 16px, damit iOS nicht hineinzoomt.
- **Kein Hover (`hover: none`):** alle versteckten Werkzeuge (`ui-reveal`) sind dauerhaft sichtbar.
- **Gesten:** Tippen öffnet, langes Drücken (280ms) hebt eine Karte zum Ziehen an; am Rand scrollt das Board mit.

## Ikonografie

- **Lucide** (`lucide-react`, wie shadcn/ui), 16px in Controls, Strichstärke 1.5–2, Farbe `currentColor`.
- Icon-only-Buttons (`ui-btn--icon`) brauchen immer `aria-label` und einen Tooltip.
- Standard-Icons: `MoreHorizontal` (Kartenmenü), `ArrowUpDown` (Sortieren), `Funnel` (Filtern – immer der Trichter, nie drei Linien), `Pencil` (Bearbeiten), `Copy`, `Trash2`.
- Keine Emojis, keine farbigen Icons.

## Verwenden

- Komponenten sind CSS-Klassen in `components/bundle.css` (Präfix `ui-`), gebaut auf den Tokens aus `tokens.json`. Es gibt kein JS-Bundle; jede Komponenten-README nennt das Markup und das shadcn/ui-Gegenstück mit Tailwind-Klassen.
- In einem shadcn/Tailwind-Projekt: Tokens als CSS-Variablen (`--background`, `--foreground` …) setzen – die Namen entsprechen shadcn 1:1 – und Reveals mit `group` + `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity` umsetzen.
- Jede Aktion, die hinter einem Hover steckt, ist zusätzlich über das CommandMenu (⌘K) erreichbar – Ruhe in der Oberfläche darf keine Funktion verstecken.
- Rückmeldungen: umkehrbare Aktionen sofort ausführen und per Toast mit „Rückgängig“ bestätigen; nur Endgültiges braucht einen Dialog.
- Werte nie hart codieren; immer `var(--token)` bzw. die Motion-Variablen `--dur-*` / `--ease-*` aus `bundle.css`.
- Seitenvorlagen stehen in der Gruppe „Pages“: KanbanPage (Board), TaskDetailPage (Aufgabe mit Domänen-Accordion), ActivityPage (Verlauf). Sie teilen dieselbe Hülle und dasselbe Datenmodell: jede Änderung an einer Aufgabe – auf dem Board oder im Detail – erscheint als Eintrag im Verlauf.
- Nachvollziehbarkeit ist Pflicht: Jede Änderung wird mit Person, Zeit und Vorher/Nachher protokolliert; Wiederherstellen erzeugt einen neuen Eintrag statt den Verlauf umzuschreiben.
