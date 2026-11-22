CLinks is a minimal, shadcn-style system built on Stille: a neutral palette, Geist, hairlines and barely any shadow. One account connects PlanerLink, InfraLink, KursLink, FinanzLink and LokaLink; the hub (landing, Portal, Admin) acts in graphite, each product app in its own colour. The guiding principle is **progressive disclosure**: at rest the interface shows content; tools appear on hover or keyboard focus.

## Ground rules

- **Content first, tools on demand.** Secondary actions of a row or card (⋯ menu, copy, edit, delete) live in RowActions and reveal on hover, focus or an open menu. Always visible: the page's primary action, navigation, form fields and status.
- **Hiding means `opacity: 0`, never `display: none`.** Nothing jumps, and hidden tools stay reachable by Tab.
- **Touch shows everything.** On `(hover: none)` every hidden tool is visible. Nothing exists only on hover; every hidden action is also in the CommandMenu (⌘K).
- **One primary action per view.** Everything else is `outline`, `ghost` or `secondary`.
- **Three planes.** Page on `background` → cards, tables and fields on `card`/`control` with `border` and `shadow-sm` → floating layers on `popover` with `shadow-md`.
- **No decoration.** No gradients, coloured card borders, emoji or filler illustrations.
- **One component per pattern.** Apps use the shared building block; an app component only wraps it to supply its texts.

## Content and tone

- Swiss German (`de-CH`) first, English second; every string comes from the catalogs. Swiss spelling: *ss*, never *ß*.
- Portal, sign-in, Admin and KursLink use *du*; the landing page and PhysioLink use *Sie*. One form per surface.
- Sentence case. Buttons start with the verb: “Speichern”, “Mitglied einladen”.
- Empty states: one sentence about what is missing, plus at most one action. No exclamation marks.
- Badges mark deviations only (“Archiviert”, “Gesperrt”); the normal state carries none.
- Errors stay at the field; confirmations name their target, never “Sind Sie sicher?”.
- Numbers, IDs and addresses in `mono` with tabular figures.

## Colour

- Text in `foreground`, secondary text in `muted-foreground`. `primary` is the only action colour; accent text uses `primary-text`.
- Fields, selects, checkboxes and outline buttons sit on `control` with an `input` outline (3:1) and `shadow-sm`; the outline darkens to `control-hover` on hover.
- Hover surfaces (rows, menu items, ghost buttons) use `accent`.
- Status is a dot plus a word: `success`, `warning`, `destructive` or `info`, the word in `foreground`. Colour never carries meaning alone.
- Dialogs and sheets lie over the `overlay` scrim; menus and popovers never.
- **Products:** PlanerLink green, FinanzLink blue, InfraLink crimson, KursLink violet, LokaLink orange, CaleLink petrol, PhysioLink stone. `data-product="<slug>"` on `<html>` makes the product colour the app's `primary`; see ProductIdentity.
- `clinks-red` belongs to the logo and the loader only. Tenants may recolour hub actions, never product apps.
- Light, Dark and System everywhere; a personal contrast slider moves only `background`, `card` and `border`.

## Typography

- One family: **Geist** (`sans`), plus **Geist Mono** (`mono`).
- Page title `page-title` (30/36, once per page; 24px on phones), sections `section-title`, dialogs `dialog-title`, body and tables `body`, labels and buttons `label`, meta `caption` in `muted-foreground`.
- Three weights only: 400, 500, 600. Emphasis comes from `foreground` against `muted-foreground`, never bold or italic.

## Space, radius, layout

- 4px grid (`space-1` … `space-12`). Card padding `space-6`, gap between cards `space-4`, page sections `space-8`.
- Controls 36px (compact 32px), icon buttons square.
- Radii from a 10px base: badges and menu items `radius-sm`, buttons and fields `radius-md`, cards and popovers `radius-lg`, switches and dots `radius-pill`.
- Content in one PageLayout (`detail` 1200px, `overview` 1280px, `list` 1440px), left-aligned; space instead of frames around groups.

## Motion

Everything moves, nothing jumps, and motion only explains where something comes from.

- **Duration:** `--dur-1` 120ms (hover, press, colour), `--dur-2` 200ms (reveals, menus, tooltips), `--dur-3` 320ms (dialogs, sheets, toasts, layout shifts). Never longer than 400ms.
- **Easing:** `--ease-out` for whatever appears or reacts, `--ease-in` for exits (shorter than the entry), `--ease-spring` only for switches and toasts.
- Buttons press to `scale(.97)`, checkboxes to `scale(.88)`; icon buttons grow 8% on hover. Menus, popovers, selects and tooltips grow from their trigger (fade, 4px, `scale(.97)`); dialogs rise 8px; sheets slide in.
- Kanban cards glide to their new place (FLIP); counters hop once when they change; the tab indicator grows from the centre; the tick is drawn; invalid fields shake once.
- `prefers-reduced-motion: reduce` makes every change instant; states still change, only without a path.
- Focus: a 2px `ring` outline at 2px offset on `:focus-visible`. Disabled: `opacity .5`, no hover, no motion.

## Responsive and touch

- Every page works from 320px; on phones the layout is rebuilt, not shrunk.
- Below 768px the sidebar becomes a drawer behind the header's menu button.
- Touch (`pointer: coarse`): controls at least 40px, list rows and menu items 44px, inputs at 16px so iOS does not zoom.

## Iconography

- **Lucide**, imported per icon from `@lucide/svelte/icons/<name>`; 16px in controls, 20px in empty states, `currentColor`.
- Icon-only actions are an IconButton: required label, tooltip and accessible name.
- Loading uses the CLinks LoadingIndicator, never a generic spinner. No emoji.

## Use

- The components are Svelte 5 primitives from `@codelinks/ui` (`packages/ui-core`), imported per path: `import { Button } from '@codelinks/ui/components/button'`. UI components never call bits-ui or an RPC client directly.
- The cards here are static renditions styled by `components/bundle.css`, built on `tokens.json`; the names match shadcn and Tailwind (`--background`, `--foreground` …).
- Never hard-code values; always `var(--token)` and the motion variables `--dur-*` / `--ease-*`.
- Reversible actions run at once and confirm with a toast offering “Rückgängig”; only final actions need a dialog.
- Page templates in the “Pages” group: BoardPage (records by state, InfraLink projects by phase), CalendarPage (day, week and month; Physio appointments, MailLink sends, KursLink sessions), TablePage (one DataTable under the page header) and ActivityPage (history with person, time and before and after).
- Calendars and drag-and-drop share one base: `ScheduleCalendar`, `@codelinks/ui/calendar` and `@codelinks/ui/drag`. Everything that moves also moves with the keyboard, on touch after a long press, and cancels with Escape.
- Logos: `clinks-wordmark` on light, `clinks-wordmark-dark` on dark, the mark alone where space is square. Flags for language choices are in `assets/Flags`.
