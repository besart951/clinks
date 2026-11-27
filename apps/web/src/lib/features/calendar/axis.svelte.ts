import type { TimeAxis } from '../../components/calendar/TimeGrid.svelte';
import { routeQuery, setQuery, type RouteUrl } from '../../navigation.ts';

/** Time running top to bottom or left to right in a time grid, kept in the link (`?axis=horizontal`). */
export class AxisSetting {
	value = $state<TimeAxis>('vertical');
	readonly #url: RouteUrl;

	constructor(url: RouteUrl) {
		this.#url = url;
		this.value = routeQuery(url).get('axis') === 'horizontal' ? 'horizontal' : 'vertical';
	}

	set(next: TimeAxis) {
		this.value = next;
		void setQuery(this.#url, { axis: next === 'horizontal' ? next : null });
	}
}
