import type { NetworkConditions } from './database.ts';

const storageKey = 'clinks.workspace.network';

interface StoredConditions {
	minLatency: number;
	maxLatency: number;
	failureRate: number;
	simulateOffline: boolean;
}

function load(): StoredConditions {
	const fallback = { minLatency: 200, maxLatency: 800, failureRate: 0, simulateOffline: false };
	try {
		return { ...fallback, ...JSON.parse(localStorage.getItem(storageKey) ?? '{}') };
	} catch {
		return fallback;
	}
}

/** Latency, failure rate and connectivity for the mock API; adjustable in the developer menu. */
export class NetworkSimulator {
	minLatency = $state(200);
	maxLatency = $state(800);
	failureRate = $state(0);
	simulateOffline = $state(false);
	browserOnline = $state(true);
	pending = $state(0);
	offline = $derived(this.simulateOffline || !this.browserOnline);

	constructor() {
		Object.assign(this, load());
		this.browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
	}

	conditions(): NetworkConditions {
		return {
			minLatency: this.minLatency,
			maxLatency: this.maxLatency,
			failureRate: this.failureRate,
			offline: this.offline,
		};
	}

	update(changes: Partial<StoredConditions>) {
		Object.assign(this, changes);
		try {
			localStorage.setItem(
				storageKey,
				JSON.stringify({
					minLatency: this.minLatency,
					maxLatency: this.maxLatency,
					failureRate: this.failureRate,
					simulateOffline: this.simulateOffline,
				}),
			);
		} catch {
			// Settings stay active for this visit.
		}
	}

	/** Follows the browser's connectivity events; returns the cleanup. */
	watchBrowser(): () => void {
		const online = () => (this.browserOnline = true);
		const offline = () => (this.browserOnline = false);
		window.addEventListener('online', online);
		window.addEventListener('offline', offline);
		return () => {
			window.removeEventListener('online', online);
			window.removeEventListener('offline', offline);
		};
	}
}
