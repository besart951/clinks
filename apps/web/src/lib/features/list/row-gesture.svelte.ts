/** How far a row must be swiped, as a share of its width, before letting go runs the action. */
export const swipeShare = 0.3;
/** A finger resting this long on a row starts picking several entries. */
export const longPressMs = 500;
/** Movement that still counts as resting, in pixels. */
const slop = 10;

/** Which side's action a swipe ends on, if any: to the right is `start`, to the left `end`. */
export function swipeSide(dx: number, width: number): 'start' | 'end' | null {
	if (width <= 0 || Math.abs(dx) < width * swipeShare) return null;
	return dx > 0 ? 'start' : 'end';
}

export interface GestureHandlers {
	/** Whether swiping to that side does something; a row without that action does not move that way. */
	canSwipe(side: 'start' | 'end'): boolean;
	swiped(side: 'start' | 'end'): void;
	longPressed(): void;
}

/**
 * Touch gestures of a list row: swiping sideways and a long press. Vertical movement is left to the browser,
 * which scrolls the list (the row sets `touch-action: pan-y`). Mouse and pen are ignored: they click and drag.
 */
export class RowGesture {
	/** The row's sideways offset while swiping. */
	dx = $state(0);
	swiping = $state(false);
	#start: { x: number; y: number; id: number } | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;
	/** Set after a long press or a swipe, so the click that follows does not also open the entry. */
	#swallow = false;
	readonly #handlers: GestureHandlers;

	constructor(handlers: GestureHandlers) {
		this.#handlers = handlers;
	}

	down(event: PointerEvent) {
		if (event.pointerType !== 'touch') return;
		this.#start = { x: event.clientX, y: event.clientY, id: event.pointerId };
		this.#swallow = false;
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.#swallow = true;
			this.#start = null;
			this.#handlers.longPressed();
		}, longPressMs);
	}

	move(event: PointerEvent) {
		if (!this.#start || event.pointerId !== this.#start.id) return;
		const dx = event.clientX - this.#start.x;
		const dy = event.clientY - this.#start.y;
		if (!this.swiping) {
			if (Math.abs(dx) < slop && Math.abs(dy) < slop) return;
			this.#cancelTimer();
			// Mostly vertical: the list scrolls, the row stays.
			if (Math.abs(dy) >= Math.abs(dx)) {
				this.#start = null;
				return;
			}
			this.swiping = true;
			try {
				(event.currentTarget as Element | null)?.setPointerCapture(event.pointerId);
			} catch {
				// The pointer is already gone; the swipe still follows it while it stays on the row.
			}
		}
		this.dx = this.#handlers.canSwipe(dx > 0 ? 'start' : 'end') ? dx : 0;
	}

	up(event: PointerEvent) {
		this.#cancelTimer();
		if (this.swiping) {
			const side = swipeSide(this.dx, (event.currentTarget as HTMLElement | null)?.offsetWidth ?? 0);
			this.#swallow = true;
			if (side) this.#handlers.swiped(side);
		}
		this.cancel();
	}

	cancel() {
		this.#cancelTimer();
		this.#start = null;
		this.swiping = false;
		this.dx = 0;
	}

	/** Whether the click now arriving ends a gesture and must not open the entry. */
	swallowClick(): boolean {
		const swallow = this.#swallow;
		this.#swallow = false;
		return swallow;
	}

	#cancelTimer() {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
	}
}
