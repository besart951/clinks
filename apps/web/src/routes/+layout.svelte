<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { Toaster } from '@clinks/ui-shared/toaster';
	import { TooltipProvider } from '@clinks/ui-shared/components/ui/tooltip';
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
		return () => {
			stopTheme();
			stopNetwork();
		};
	});
</script>

<TooltipProvider delayDuration={300}>
	{@render children()}
</TooltipProvider>
<Toaster position="bottom-right" closeButton />
