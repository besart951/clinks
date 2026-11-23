/** Distance between sort keys after renumbering, so most moves fit between two neighbours. */
export const orderGap = 1024;

/**
 * The integer sort key for an item placed at `index` among `neighbours` (the other items' keys, sorted).
 * Returns null when no integer fits between the two neighbours; then the list needs `spacedOrders`.
 */
export function orderAt(neighbours: readonly number[], index: number): number | null {
	const before = neighbours[index - 1];
	const after = neighbours[index];
	if (before === undefined && after === undefined) return 0;
	if (before === undefined) return after - orderGap;
	if (after === undefined) return before + orderGap;
	const middle = Math.floor((before + after) / 2);
	return middle > before && middle < after ? middle : null;
}

/** Fresh, evenly spaced sort keys for a list of `count` items. */
export function spacedOrders(count: number): number[] {
	return Array.from({ length: count }, (_, index) => index * orderGap);
}
