/** What opening an entry takes: a click (a mail shown beside the list) or a double click (a file, a dialog). */
export type OpenOn = 'click' | 'double';

/** What a press on an entry of a selectable list does. */
export type ListPress = 'toggle' | 'range' | 'mark' | 'open';

export interface PressInput {
	/** Clicks in a row as the browser counts them; 0 for Enter or Space. */
	detail: number;
	/** Ctrl, or Cmd on a Mac. */
	ctrl: boolean;
	shift: boolean;
	touch: boolean;
	/** A long press started picking several entries; taps then add or remove instead of opening. */
	picking: boolean;
	openOn: OpenOn;
}

/**
 * The rules of every selectable list, as people know them from Windows and phones: Ctrl adds or removes one
 * entry, Shift picks the range from the last one, a plain click marks one (or opens it where a click opens).
 * A double click or a key press opens. A tap opens, unless a long press started picking.
 */
export function listPress(input: PressInput): ListPress {
	if (input.ctrl) return 'toggle';
	if (input.shift) return 'range';
	if (input.touch) return input.picking ? 'toggle' : 'open';
	if (input.detail === 0 || input.detail >= 2) return 'open';
	return input.openOn === 'click' ? 'open' : 'mark';
}

export function pressInput(event: MouseEvent, picking: boolean, openOn: OpenOn): PressInput {
	return {
		detail: event.detail,
		ctrl: event.ctrlKey || event.metaKey,
		shift: event.shiftKey,
		touch: 'pointerType' in event && (event as PointerEvent).pointerType === 'touch',
		picking,
		openOn,
	};
}

/** The ids from `anchor` to `target` in list order, both included; just `target` without an anchor. */
export function rangeBetween<Id>(order: readonly Id[], anchor: Id | null, target: Id): Id[] {
	const to = order.indexOf(target);
	const from = anchor === null ? -1 : order.indexOf(anchor);
	if (to === -1) return [];
	if (from === -1) return [target];
	return order.slice(Math.min(from, to), Math.max(from, to) + 1);
}
