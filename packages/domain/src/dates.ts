import type { CalendarDate, Timestamp } from './types.ts';

const minute = 60_000;
const day = 24 * 60 * minute;

function pad(value: number) {
	return String(value).padStart(2, '0');
}

/** The local calendar date of a moment, independent of the UTC offset. */
export function toCalendarDate(value: Date | Timestamp): CalendarDate {
	const date = typeof value === 'string' ? new Date(value) : value;
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromCalendarDate(value: CalendarDate, time = '00:00'): Date {
	const [year, month, dayOfMonth] = value.split('-').map(Number);
	const [hours, minutes] = time.split(':').map(Number);
	return new Date(year, month - 1, dayOfMonth, hours, minutes);
}

export function today(now: Date = new Date()): CalendarDate {
	return toCalendarDate(now);
}

export function addDays(value: CalendarDate, days: number): CalendarDate {
	const date = fromCalendarDate(value);
	date.setDate(date.getDate() + days);
	return toCalendarDate(date);
}

export function minutesBetween(start: Timestamp, end: Timestamp): number {
	return Math.round((new Date(end).getTime() - new Date(start).getTime()) / minute);
}

export function daysBetween(from: CalendarDate, to: CalendarDate): number {
	return Math.round((fromCalendarDate(to).getTime() - fromCalendarDate(from).getTime()) / day);
}

/** Monday of the week that contains the date (ISO weeks start on Monday). */
export function startOfWeek(value: CalendarDate): CalendarDate {
	const weekday = (fromCalendarDate(value).getDay() + 6) % 7;
	return addDays(value, -weekday);
}

export function startOfMonth(value: CalendarDate): CalendarDate {
	return `${value.slice(0, 7)}-01`;
}

export function addMonths(value: CalendarDate, months: number): CalendarDate {
	const date = fromCalendarDate(startOfMonth(value));
	date.setMonth(date.getMonth() + months);
	return toCalendarDate(date);
}

export function weekDays(start: CalendarDate, count = 7): CalendarDate[] {
	return Array.from({ length: count }, (_, index) => addDays(start, index));
}

/** Six full weeks that cover a month, starting on a Monday. */
export function monthGrid(value: CalendarDate): CalendarDate[] {
	return weekDays(startOfWeek(startOfMonth(value)), 42);
}

/** ISO 8601 week number: week 1 holds the year's first Thursday. */
export function isoWeek(value: CalendarDate): number {
	const thursday = fromCalendarDate(addDays(startOfWeek(value), 3));
	const firstThursday = fromCalendarDate(addDays(startOfWeek(`${thursday.getFullYear()}-01-04`), 3));
	return Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000)) + 1;
}

export function isoWeekday(value: CalendarDate): number {
	return ((fromCalendarDate(value).getDay() + 6) % 7) + 1;
}

export function timeOfDay(value: Timestamp): string {
	const date = new Date(value);
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function minutesOfDay(value: Timestamp): number {
	const date = new Date(value);
	return date.getHours() * 60 + date.getMinutes();
}

export function atTime(date: CalendarDate, time: string): Timestamp {
	return fromCalendarDate(date, time).toISOString();
}

/** Minutes after midnight of a time such as `09:45`. */
export function timeToMinutes(value: string): number {
	const [hours, minutes] = value.split(':').map(Number);
	return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
	return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Completed years between a birth date and a reference day. */
export function ageOn(birthDate: CalendarDate, on: CalendarDate): number {
	const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
	const [year, month, day] = on.split('-').map(Number);
	return year - birthYear - (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0);
}
