/** The usual times to be reminded of a mail again, local time. */
export type SnoozeChoice = 'evening' | 'tomorrow' | 'monday';

/**
 * When each choice ends, from `now`: this evening at 18:00 (only before 17:00), tomorrow at 08:00, next Monday
 * at 08:00. Local time of the device, as people pick them.
 */
export function snoozeChoices(now: Date): { choice: SnoozeChoice; until: Date }[] {
	const at = (days: number, hour: number) => {
		const date = new Date(now);
		date.setDate(date.getDate() + days);
		date.setHours(hour, 0, 0, 0);
		return date;
	};
	const toMonday = (8 - now.getDay()) % 7 || 7;
	return [
		...(now.getHours() < 17 ? [{ choice: 'evening' as const, until: at(0, 18) }] : []),
		{ choice: 'tomorrow', until: at(1, 8) },
		{ choice: 'monday', until: at(toMonday, 8) },
	];
}
