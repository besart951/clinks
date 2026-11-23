/** Expire a connected session after inactivity. Pending offline work survives until it can upload. */
export function watchInactivity(expire: () => Promise<void>, ready: () => boolean, minutes: number) {
	let last = Date.now();
	let expiring = false;
	const activity = () => {
		last = Date.now();
	};
	const inspect = async () => {
		if (expiring || !ready() || Date.now() - last < minutes * 60000) return;
		expiring = true;
		try {
			await expire();
		} finally {
			expiring = false;
			activity();
		}
	};
	for (const event of ['pointerdown', 'keydown', 'touchstart'])
		window.addEventListener(event, activity, { passive: true });
	const timer = window.setInterval(() => void inspect(), 15000);
	document.addEventListener('visibilitychange', inspect);
	return () => {
		clearInterval(timer);
		document.removeEventListener('visibilitychange', inspect);
		for (const event of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(event, activity);
	};
}
