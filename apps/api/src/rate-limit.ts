/**
 * Fixed-window counters in memory. Enough for one API instance; with several instances behind the
 * proxy the same interface moves to Postgres or Redis.
 */
export class RateLimiter {
	readonly #windows = new Map<string, { count: number; resetAt: number }>();
	readonly #now: () => number;

	constructor(now: () => number = Date.now) {
		this.#now = now;
	}

	/** Counts one attempt; false once `limit` attempts happened within `windowMs`. */
	attempt(key: string, limit: number, windowMs: number): boolean {
		const now = this.#now();
		if (this.#windows.size > 10_000) this.#sweep(now);
		const window = this.#windows.get(key);
		if (!window || window.resetAt <= now) {
			this.#windows.set(key, { count: 1, resetAt: now + windowMs });
			return true;
		}
		window.count += 1;
		return window.count <= limit;
	}

	reset(key: string) {
		this.#windows.delete(key);
	}

	#sweep(now: number) {
		for (const [key, window] of this.#windows) if (window.resetAt <= now) this.#windows.delete(key);
	}
}
