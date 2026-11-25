<script lang="ts" module>
	export interface ConfirmRequest {
		title: string;
		description: string;
		confirmLabel: string;
		destructive?: boolean;
		onConfirm: () => void | Promise<void>;
	}
</script>

<script lang="ts">
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { request = $bindable(null) }: { request: ConfirmRequest | null } = $props();
	const workspace = useWorkspace();
	let busy = $state(false);

	async function confirm() {
		if (!request) return;
		busy = true;
		try {
			await request.onConfirm();
		} finally {
			busy = false;
			request = null;
		}
	}
</script>

<Dialog.Root open={request !== null} onOpenChange={(open) => !open && (request = null)}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} showCloseButton={false} class="sm:max-w-md">
		{#if request}
			<Dialog.Header>
				<Dialog.Title>{request.title}</Dialog.Title>
				<Dialog.Description>{request.description}</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button variant="outline" autofocus={request.destructive ? true : undefined} onclick={() => (request = null)}>
					{workspace.t('ui.ws.cancel')}
				</Button>
				<Button variant={request.destructive ? 'destructive' : 'default'} disabled={busy} onclick={confirm}>
					{request.confirmLabel}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
