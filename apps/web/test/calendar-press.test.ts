import { describe, expect, it } from 'vitest';
import { appointmentPress, slotPress } from '../src/lib/features/calendar/press';

/** A click as the browser reports it: `detail` counts the clicks, 0 for a key press. */
function click(detail: number, pointerType = 'mouse') {
	return { detail, pointerType } as unknown as MouseEvent;
}

describe('appointmentPress', () => {
	it('marks on a click and opens on a double click', () => {
		expect(appointmentPress(click(1), false)).toBe('mark');
		expect(appointmentPress(click(1), true)).toBe('mark');
		expect(appointmentPress(click(2), true)).toBe('open');
	});

	it('opens on Enter or Space, which report no click count', () => {
		expect(appointmentPress(click(0), false)).toBe('open');
	});

	it('opens on a touch screen with a second tap on the marked appointment', () => {
		expect(appointmentPress(click(1, 'touch'), false)).toBe('mark');
		expect(appointmentPress(click(1, 'touch'), true)).toBe('open');
	});
});

describe('slotPress', () => {
	it('clears the mark first, creates on a double click', () => {
		expect(slotPress(click(1), true)).toBe('clear');
		expect(slotPress(click(1), false)).toBe('none');
		expect(slotPress(click(2), false)).toBe('create');
	});

	it('creates with a single tap on a touch screen', () => {
		expect(slotPress(click(1, 'touch'), false)).toBe('create');
		expect(slotPress(click(1, 'touch'), true)).toBe('clear');
	});
});
