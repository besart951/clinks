# ActivityPage

A record's history: every change with person, time and before and after; system events without a person show a dot.

## Markup

```svelte
<ActivityLog entries={activities} labels={{ log: 'Aktivität', empty: 'Noch keine Aktivität', none: '–' }} formatTime={formatDateTime} />
```

## Rules

- Entries are newest first; names come from stored ids and are resolved when shown.
- Restoring an earlier state writes a new entry; history is never rewritten.
- Admin user detail uses it for the account activity; formats and texts come from the app.

## Source

`activity-log/activity-log.svelte`, `app/web/admin/src/lib/features/platform-overview/ui/user-detail/AdminUserAccountSection.svelte`
