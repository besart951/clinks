import { addDays, isoWeekday } from './dates.ts';
import type { VisitNeed } from './types.ts';

/** A planning period covers at most 93 calendar days, including both endpoints. */
export function visitNeedDays(need: Pick<VisitNeed, 'startsOn' | 'endsOn' | 'weekdays'>): string[] {
	const span = (Date.parse(need.endsOn) - Date.parse(need.startsOn)) / 86400000;
	if (!Number.isInteger(span) || span < 0 || span > 92 || need.weekdays.length === 0) return [];
	const days: string[] = [];
	for (let day = need.startsOn; day <= need.endsOn; day = addDays(day, 1)) {
		if (need.weekdays.includes(isoWeekday(day))) days.push(day);
	}
	return days;
}
