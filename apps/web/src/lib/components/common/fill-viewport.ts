/**
 * Svelte attachment: on wide screens, gives the element the height from its top to the bottom of the window,
 * so panes inside it can scroll on their own and keep the same height whatever they contain. Narrow screens
 * keep the normal page flow.
 */
export function fillViewport(options: { reserve?: number; minWidth?: number } = {}) {
	const { reserve = 24, minWidth = 1024 } = options;
	return (element: HTMLElement) => {
		const wide = matchMedia(`(min-width: ${minWidth}px)`);
		const measure = () => {
			if (!wide.matches) {
				element.style.removeProperty('height');
				return;
			}
			const top = element.getBoundingClientRect().top + scrollY;
			element.style.height = `${Math.max(320, innerHeight - top - reserve)}px`;
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(document.documentElement);
		addEventListener('resize', measure);
		wide.addEventListener('change', measure);
		return () => {
			observer.disconnect();
			removeEventListener('resize', measure);
			wide.removeEventListener('change', measure);
			element.style.removeProperty('height');
		};
	};
}
