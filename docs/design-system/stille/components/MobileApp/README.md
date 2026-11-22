# MobileApp

Board, Aufgaben-Detail und Verlauf in Handybreite (390px) – dieselben Seiten wie auf dem Desktop, nur umgebaut, nicht verkleinert.

## Breakpoints
- **≤ 900px:** Sidebar wird zur Schublade (Menü-Knopf in der Topbar, Scrim, `Esc` schliesst); Topbar 56px, sticky.
- **≤ 760px:** Breadcrumb aus, Titel 24px; Werkzeugleiste bricht um (Suche volle Breite, Bereichs-Filter als wischbare Leiste); Tabs wischbar; Board zeigt eine Spalte pro Bildschirm (82vw, Scroll-Snap); Aufgaben-Detail im Vollbild von unten, eine Spalte in der Reihenfolge Titel → Attribute → Beschreibung → Checkliste → Aktivität; Dialog-Buttons volle Breite; Toasts volle Breite.
- **Touch (`pointer: coarse`):** Tippflächen ≥ 40px (Attribute 44px, Accordion-Köpfe 48px); Eingaben in 16px, damit iOS nicht zoomt.
- **Kein Hover (`hover: none`):** alle `ui-reveal`-Werkzeuge sind sichtbar; doppelte Zeilen-Aktionen im Verlauf entfallen (das aufgeklappte Panel hat sie).

## Gesten
- Board wischen = Spalte wechseln; Karte antippen = Detail öffnen.
- **Karte lange drücken (280ms)** hebt sie an (kurze Vibration), dann ziehen; am Bildschirmrand scrollt das Board mit. Während eine Karte gehalten wird, scrollt die Seite nicht.

## Regeln
- Nichts verschwindet auf dem Handy, es wird nur umgeordnet – jede Funktion bleibt erreichbar.
- Feste Breiten nur als `max-width`; Höhen mit `100dvh`.
