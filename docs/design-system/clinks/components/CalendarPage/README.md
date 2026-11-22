# CalendarPage

A page of dated entries as day, week or month; Physio shows its appointments, MailLink its planned sends.

## Markup

```svelte
<ScheduleCalendar
  {entries} bind:date bind:view views={['day', 'week', 'month']}
  {today} locale={i18n.locale} labels={translatedCalendarLabels(i18n.t)}
  onNavigate={(range) => load(range.days)}
  onSelect={(entry) => open(entry)} onCreate={(slot) => create(slot)}
  onChange={(change) => save(change.entry, change.date, change.start, change.end)}
/>
```

## Rules

- One calendar for every app: entries are `{ id, date, start, end, title }` in the civil time of the practice, studio or schedule; `@codelinks/ui/calendar` converts instants and handles daylight saving.
- An entry moves by drag, on touch after a long press, and with the arrow keys (Shift changes the duration); Enter saves, Escape discards. The entry is drawn where it would land, snapped to five minutes, and the change is announced.
- Moving is a real save with the expected version; the calendar only reports the change and keeps the entry in place until the save settles.
- Overlapping entries share a column; colour comes from `tone` through `--calendar-tone` (edge and an 8 % tint), never from text colour alone.
- Points in time such as a send get `resizable={false}`; recurring entries are `readonly` and open their rule instead.
- A day picker uses `CalendarMonth` with `picker`: one tab stop, arrows between days, the selected day as a toggle.

## Source

`schedule-calendar/`, `calendar/`, `drag/`; `app/web/physio/…/PracticeCalendar.svelte`, `app/web/app/…/communications/ui/SendCalendar.svelte`, `app/web/kurs/…/StudioCalendarPage.svelte`
