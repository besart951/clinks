import { addDays, addMonths, isoWeekday, monthGrid, startOfWeek, today, weekDays } from '@clinks/domain/dates';
import type { CalendarDate } from '@clinks/domain/types';
import type { Preferences } from '../../platform/types.ts';

export type PeriodUnit = 'day' | 'week' | 'month';

export interface PeriodOptions {
	/** The units this view can show, e.g. `['day', 'week']`; the first is the default. */
	units: readonly PeriodUnit[];
	/** What the small calendar offers, if more than `units`: picking a week in a day view goes to its Monday. */
	jumps?: readonly PeriodUnit[];
	unit?: PeriodUnit;
	anchor?: CalendarDate;
	/**
	 * Remembers hidden weekdays in this browser under this name (one per view: hiding the weekend in the calendar
	 * leaves the Spitex plan as it is). Without it, weekdays cannot be hidden.
	 */
	weekdays?: { key: string; preferences: Preferences };
	/** Called when the shown range changes, e.g. to load another week. */
	onchange?: (range: readonly [CalendarDate, CalendarDate]) => void;
	/** Called when the unit changes, e.g. by picking a week in the small calendar. */
	onunit?: (unit: PeriodUnit) => void;
}

/**
 * What every calendar view shares: the date on show, the unit (day, week or month), stepping back and forth, today,
 * and the weekdays a view leaves out. Views keep their own data and layout and build on this.
 */
export class CalendarPeriod {
	anchor = $state<CalendarDate>(today());
	unit = $state<PeriodUnit>('day');
	/** ISO weekdays (1 = Monday … 7 = Sunday) the view leaves out, e.g. the weekend. */
	hiddenWeekdays = $state<number[]>([]);
	readonly units: readonly PeriodUnit[];
	readonly jumps: readonly PeriodUnit[];
	readonly #weekdays: PeriodOptions['weekdays'];
	readonly #onchange: PeriodOptions['onchange'];
	readonly #onunit: PeriodOptions['onunit'];

	constructor(options: PeriodOptions) {
		this.units = options.units;
		this.jumps = options.jumps ?? options.units;
		this.unit = options.unit ?? options.units[0];
		this.anchor = options.anchor ?? today();
		this.#weekdays = options.weekdays;
		this.#onchange = options.onchange;
		this.#onunit = options.onunit;
		if (this.#weekdays) this.hiddenWeekdays = this.#weekdays.preferences.read<number[]>(this.#prefKey, []);
	}

	/** Whether this view lets weekdays be hidden. */
	get weekdaysHideable() {
		return !!this.#weekdays;
	}

	/** Every day of the period: the anchor, its week (Monday first) or the month grid (whole weeks). */
	get days(): CalendarDate[] {
		if (this.unit === 'month') return monthGrid(this.anchor);
		if (this.unit === 'week') return weekDays(startOfWeek(this.anchor), 7);
		return [this.anchor];
	}

	/** The days drawn: without the hidden weekdays (a single day is always shown). */
	get shownDays(): CalendarDate[] {
		return this.unit === 'day' ? this.days : this.withoutHidden(this.days);
	}

	/** The week around the anchor, e.g. for a day view's week strip. */
	get week(): CalendarDate[] {
		return weekDays(startOfWeek(this.anchor), 7);
	}

	get range(): readonly [CalendarDate, CalendarDate] {
		const days = this.days;
		return [days[0], days[days.length - 1]];
	}

	/** Whether today is on show: «Heute» has nothing to do then. */
	get showsToday(): boolean {
		const [from, to] = this.range;
		const now = today();
		return now >= from && now <= to;
	}

	withoutHidden(days: readonly CalendarDate[]): CalendarDate[] {
		return days.filter((day) => !this.hiddenWeekdays.includes(isoWeekday(day)));
	}

	/** One period back or forward, or back to today with 0. */
	go(direction: -1 | 0 | 1) {
		if (direction === 0) this.#move(today());
		else if (this.unit === 'month') this.#move(addMonths(this.anchor, direction));
		else this.#move(addDays(this.anchor, direction * (this.unit === 'week' ? 7 : 1)));
	}

	setAnchor(date: CalendarDate) {
		this.#move(date);
	}

	setUnit(unit: PeriodUnit) {
		if (!this.units.includes(unit) || unit === this.unit) return;
		const before = this.range;
		this.unit = unit;
		this.#onunit?.(unit);
		this.#changed(before);
	}

	/** A pick in the small calendar: that date, in the unit picked when the view has it. */
	pick(unit: PeriodUnit, date: CalendarDate) {
		this.setAnchor(date);
		this.setUnit(unit);
	}

	/** Hides a weekday; at least one stays. */
	hideWeekday(weekday: number) {
		if (!this.#weekdays || this.hiddenWeekdays.includes(weekday) || this.hiddenWeekdays.length >= 6) return;
		this.#saveWeekdays([...this.hiddenWeekdays, weekday].sort());
	}

	toggleWeekday(weekday: number) {
		if (this.hiddenWeekdays.includes(weekday)) this.#saveWeekdays(this.hiddenWeekdays.filter((day) => day !== weekday));
		else this.hideWeekday(weekday);
	}

	showAllWeekdays() {
		this.#saveWeekdays([]);
	}

	get #prefKey() {
		return `clinks.workspace.${this.#weekdays?.key}.hiddenWeekdays`;
	}

	#saveWeekdays(days: number[]) {
		this.hiddenWeekdays = days;
		this.#weekdays?.preferences.write(this.#prefKey, days);
	}

	#move(date: CalendarDate) {
		const before = this.range;
		this.anchor = date;
		this.#changed(before);
	}

	#changed(before: readonly [CalendarDate, CalendarDate]) {
		const after = this.range;
		if (after[0] !== before[0] || after[1] !== before[1]) this.#onchange?.(after);
	}
}
