<script lang="ts">
	import type { MailDelivery } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Where a mail sent through CLinks stands, in words; nothing once it went out. */
	let { delivery }: { delivery: MailDelivery | null } = $props();
	const workspace = useWorkspace();
</script>

{#if delivery && delivery !== 'sent'}
	<span class="block text-xs {delivery === 'queued' ? 'text-muted-foreground' : 'text-destructive'}">
		{workspace.t(`ui.ws.mail.delivery.${delivery}`)}
	</span>
{/if}
