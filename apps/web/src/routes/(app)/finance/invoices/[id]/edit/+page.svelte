<script lang="ts">
	import { page } from '$app/state';
	import InvoiceEditorPage from '#lib/components/finance/InvoiceEditorPage.svelte';
	import type { InvoiceId } from '@clinks/domain/ids';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
</script>

<svelte:head><title>{workspace.t('ui.ws.module.finance')} · CLinks</title></svelte:head>
<InvoiceEditorPage id={page.params.id as InvoiceId} />
