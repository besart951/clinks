<script lang="ts">
	import SectionNav from '$lib/components/shell/SectionNav.svelte';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
</script>

<SectionNav
	label={workspace.t('ui.ws.module.spitex')}
	links={[
		{ path: '/spitex', label: 'ui.ws.spitex.planning', exact: true },
		{ path: '/spitex/clients', label: 'ui.ws.spitex.clients' },
		{ path: '/spitex/time', label: 'ui.ws.spitex.time_tracking' },
	]}
/>
