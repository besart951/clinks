import type { Preferences } from '../platform/types.ts';
import type { NetworkConditions } from './database.ts';

const storageKey = 'clinks.workspace.network';

interface StoredConditions {
	minLatency: number;
	maxLatency: number;
	failureRate: number;
	simulateOffline: boolean;
}

const defaults: StoredConditions = { minLatency: 200, maxLatency: 800, failureRate: 0, simulateOffline: false };

/** Latency, failure rate and connectivity for the mock API; adjustable in the developer menu. */
export class NetworkSimulator {
	minLatency = $state(200);
	maxLatency = $state(800);
	failureRate = $state(0);
	simulateOffline = $state(false);
	browserOnline = $state(true);
	pending = $state(0);
	offline = $derived(this.simulateOffline || !this.browserOnline);

	#preferences: Preferences;

	constructor(preferences: Preferences) {
		this.#preferences = preferences;
		Object.assign(this, { ...defaults, ...preferences.read<Partial<StoredConditions>>(storageKey, {}) });
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
		this.#preferences.write(storageKey, {
			minLatency: this.minLatency,
			maxLatency: this.maxLatency,
			failureRate: this.failureRate,
			simulateOffline: this.simulateOffline,
		});
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
