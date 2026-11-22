<script lang="ts">
	import { watchInactivity } from '#lib/session/idle';
	import { navigate } from '#lib/navigation';
	import { onMount, type Snippet } from 'svelte';
	import { Toaster } from '@clinks/ui/toaster';
	import { TooltipProvider } from '@clinks/ui/components/ui/tooltip';
	import { Workspace, setWorkspace } from '#lib/workspace.svelte';
	import '../app.css';

	let { children }: { children: Snippet } = $props();
	const workspace = new Workspace();
	setWorkspace(workspace);
	void workspace.session.restore();

	onMount(() => {
		document.documentElement.lang = workspace.i18n.locale;
		const stopTheme = workspace.theme.initialize();
		const stopNetwork = workspace.network.watchBrowser();
		const minutes = Number(import.meta.env.VITE_IDLE_MINUTES ?? 30);
		const stopIdle = workspace.remote
			? watchInactivity(
					async () => {
						await workspace.session.signOut();
						await navigate('/login');
					},
					() => workspace.session.status === 'authenticated' && workspace.sync?.pendingWrites === 0,
					Number.isFinite(minutes) && minutes > 0 ? minutes : 30,
				)
			: () => {};
		const resume = () => {
			if (workspace.remote && workspace.session.status === 'authenticated' && !workspace.remote.signedIn)
				void workspace.run(() => workspace.session.restore());
		};
		window.addEventListener('online', resume);
		return () => {
			window.removeEventListener('online', resume);
			stopIdle();
			stopTheme();
			stopNetwork();
		};
	});
</script>

<TooltipProvider delayDuration={300}>
	{@render children()}
</TooltipProvider>
<Toaster position="bottom-right" closeButton />
