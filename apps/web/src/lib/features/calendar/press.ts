/**
 * What a click in a calendar grid does, the same in every calendar view. A click marks an appointment and a
 * double click opens it, so pointing at one never covers the plan with a panel. A key press (Enter or Space)
 * opens it, since a keyboard has no double click. A finger cannot double tap reliably, so on a touch screen
 * the first tap marks and a tap on the marked appointment opens it.
 */
export function appointmentPress(event: MouseEvent, marked: boolean): 'mark' | 'open' {
	if (event.detail === 0 || event.detail >= 2) return 'open';
	return isTouch(event) && marked ? 'open' : 'mark';
}

/**
 * A click on free time: while an appointment is marked, the first click only clears the mark. A double
 * click creates an appointment there, and on a touch screen a single tap does.
 */
export function slotPress(event: MouseEvent, marked: boolean): 'clear' | 'create' | 'none' {
	if (event.detail >= 2) return 'create';
	if (marked) return 'clear';
	return isTouch(event) ? 'create' : 'none';
}

function isTouch(event: MouseEvent) {
	return 'pointerType' in event && (event as PointerEvent).pointerType === 'touch';
}
