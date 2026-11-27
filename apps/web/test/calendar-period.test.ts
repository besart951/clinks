import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { CalendarPeriod } from '../src/lib/features/calendar/calendar-period.svelte.ts';

function memory() {
	const values = new Map<string, unknown>();
	return {
		values,
		read: <T>(key: string, fallback: T) => (values.has(key) ? (values.get(key) as T) : fallback),
		write: (key: string, value: unknown) => void values.set(key, value),
		remove: (key: string) => void values.delete(key),
	};
}

describe('calendar period', () => {
	it('steps by its unit and reports only real range changes', () => {
		const ranges: string[] = [];
		const period = new CalendarPeriod({
			units: ['day', 'week', 'month'],
			unit: 'week',
			anchor: '2026-11-25',
			onchange: ([from, to]) => ranges.push(`${from}/${to}`),
		});
		assert.deepEqual(period.range, ['2026-11-23', '2026-11-29']);
		period.go(1);
		period.setAnchor('2026-12-01'); // same week: nothing to load
		period.setUnit('month');
		assert.deepEqual(period.range, ['2026-11-30', '2027-01-10']);
		period.go(-1);
		assert.equal(period.anchor, '2026-11-01');
		assert.deepEqual(ranges, ['2026-11-30/2026-12-06', '2026-11-30/2027-01-10', '2026-10-26/2026-12-06']);
	});

	it('picks a unit only when the view has it; a week in a day view goes to that day', () => {
		const units: string[] = [];
		const period = new CalendarPeriod({ units: ['day'], jumps: ['day', 'week'], onunit: (unit) => units.push(unit) });
		period.pick('week', '2026-12-07');
		assert.deepEqual([period.unit, period.anchor, period.jumps], ['day', '2026-12-07', ['day', 'week']]);
		assert.deepEqual(units, []);
	});

	it('hides weekdays per view, remembers them and keeps at least one day', () => {
		const preferences = memory();
		const calendar = new CalendarPeriod({
			units: ['week'],
			anchor: '2026-11-25',
			weekdays: { key: 'calendar', preferences },
		});
		calendar.hideWeekday(6);
		calendar.toggleWeekday(7);
		assert.deepEqual(calendar.shownDays.at(-1), '2026-11-27');
		for (const weekday of [1, 2, 3, 4, 5]) calendar.hideWeekday(weekday);
		assert.equal(calendar.shownDays.length, 1);

		const again = new CalendarPeriod({ units: ['week'], weekdays: { key: 'calendar', preferences } });
		assert.equal(again.hiddenWeekdays.length, 6);
		const spitex = new CalendarPeriod({ units: ['day'], weekdays: { key: 'spitex', preferences } });
		assert.deepEqual(spitex.hiddenWeekdays, []);
		assert.equal(new CalendarPeriod({ units: ['day'] }).weekdaysHideable, false);
		again.showAllWeekdays();
		assert.deepEqual(preferences.values.get('clinks.workspace.calendar.hiddenWeekdays'), []);
	});

	it('shows a single day even when its weekday is hidden', () => {
		const period = new CalendarPeriod({
			units: ['day'],
			anchor: '2026-11-28',
			weekdays: { key: 'x', preferences: memory() },
		});
		period.hideWeekday(6);
		assert.deepEqual(period.shownDays, ['2026-11-28']);
		assert.equal(period.week.length, 7);
		assert.equal(period.withoutHidden(period.week).length, 6);
	});
});
