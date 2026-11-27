/**
 * Svelte attachment: focuses the element as soon as it appears, e.g. an input shown by a click. The `autofocus`
 * attribute only works when the page loads, not for elements added later.
 */
export function focusOnMount(element: HTMLElement) {
	element.focus({ preventScroll: true });
	element.scrollIntoView({ block: 'nearest' });
}
