<script lang="ts">
	import SectionNav from '$lib/components/shell/SectionNav.svelte';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
</script>

<SectionNav
	label={workspace.t('ui.ws.module.finance')}
	links={[
		{ path: '/finance', label: 'ui.ws.command.group_invoices', exact: true, match: '/finance/invoices' },
		{ path: '/finance/expenses', label: 'ui.ws.finance.expenses' },
		{ path: '/finance/reports', label: 'ui.ws.finance.reports' },
	]}
/>
