export function infiniteScroll(node: HTMLElement, onIntersect: () => void) {
	const sentinel = document.createElement('div');
	sentinel.style.height = '1px';
	node.appendChild(sentinel);

	const observer = new IntersectionObserver(
		([entry]) => {
			if (entry?.isIntersecting) onIntersect();
		},
		{ rootMargin: '200px' },
	);

	observer.observe(sentinel);

	return {
		destroy() {
			observer.disconnect();
			sentinel.remove();
		},
	};
}
