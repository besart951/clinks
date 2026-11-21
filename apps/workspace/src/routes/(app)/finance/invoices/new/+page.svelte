<script lang="ts">
	import { page } from '$app/state';
	import InvoiceEditorPage from '$lib/components/finance/InvoiceEditorPage.svelte';
	import type { AppointmentId, ContactId } from '$lib/domain/ids';
	import { routeQuery } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const query = routeQuery(page.url);
</script>

<svelte:head><title>{workspace.t('ui.ws.command.new_invoice')} · CLinks</title></svelte:head>
<InvoiceEditorPage contactId={query.get('contact') as ContactId | null} appointmentId={query.get('appointment') as AppointmentId | null} />
