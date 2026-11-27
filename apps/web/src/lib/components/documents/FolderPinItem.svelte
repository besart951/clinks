<script lang="ts">
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import Pin from '@lucide/svelte/icons/pin';
	import PinOff from '@lucide/svelte/icons/pin-off';
	import type { Folder } from '@clinks/domain/types';
	import type { DocumentsModel } from '#lib/features/documents/documents.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** «Anheften» or «Lösen» in a folder's menu: pinned folders sit at the top of the sidebar, on this device. */
	let { model, folder }: { model: DocumentsModel; folder: Folder } = $props();
	const workspace = useWorkspace();
</script>

<DropdownMenu.Item onclick={() => model.togglePin(folder)}>
	{#if model.isPinned(folder)}<PinOff />{workspace.t('ui.ws.documents.unpin')}{:else}<Pin />{workspace.t(
			'ui.ws.documents.pin',
		)}{/if}
</DropdownMenu.Item>
