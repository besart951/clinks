<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import ConfirmDialog, { type ConfirmRequest } from './ConfirmDialog.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { dirty }: { dirty: boolean } = $props();
	const workspace = useWorkspace();
	let request = $state<ConfirmRequest | null>(null);
	let allowed = false;

	beforeNavigate((navigation) => {
		if (!dirty || allowed || !navigation.to) return;
		if (navigation.type === 'leave') {
			navigation.cancel();
			return;
		}
		navigation.cancel();
		const target = navigation.to.url;
		request = {
			title: workspace.t('ui.ws.unsaved.title'),
			description: workspace.t('ui.ws.unsaved.text'),
			confirmLabel: workspace.t('ui.ws.unsaved.discard'),
			destructive: true,
			onConfirm: () => {
				allowed = true;
				void goto(target);
			},
		};
	});
</script>

<svelte:window onbeforeunload={(event) => dirty && event.preventDefault()} />
<ConfirmDialog bind:request />
