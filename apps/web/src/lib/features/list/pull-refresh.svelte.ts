/** How far the list must be pulled down, in pixels, for letting go to refresh. */
export const pullThreshold = 64;

/** The shown offset for a finger moved `dy` down: it follows with resistance and stops at twice the threshold. */
export function pullOffset(dy: number): number {
	return dy <= 0 ? 0 : Math.min(pullThreshold * 2, dy * 0.5);
}

/**
 * Pull to refresh on a scrolling list, as on phones: only from the very top, only with a finger. The browser's
 * own pull (reloading the whole page) is turned off on the list with `overscroll-behavior-y: contain`.
 */
export class PullRefresh {
	offset = $state(0);
	refreshing = $state(false);
	#start: number | null = null;
	readonly #refresh: () => Promise<unknown>;

	constructor(refresh: () => Promise<unknown>) {
		this.#refresh = refresh;
	}

	start(y: number, scrollTop: number) {
		this.#start = scrollTop <= 0 && !this.refreshing ? y : null;
	}

	move(y: number) {
		if (this.#start === null) return;
		this.offset = pullOffset(y - this.#start);
	}

	async end() {
		const pulled = this.offset >= pullThreshold;
		this.#start = null;
		this.offset = 0;
		if (!pulled) return;
		this.refreshing = true;
		try {
			await this.#refresh();
		} finally {
			this.refreshing = false;
		}
	}
}
