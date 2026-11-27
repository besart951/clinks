<script lang="ts">
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import Pin from '@lucide/svelte/icons/pin';
	import PinOff from '@lucide/svelte/icons/pin-off';
	import CloudDownload from '@lucide/svelte/icons/cloud-download';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import type { Folder } from '@clinks/domain/types';
	import type { DocumentsModel } from '#lib/features/documents/documents.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/**
	 * A folder's settings for this device in its menu: pinned at the top of the sidebar, and its files kept
	 * offline (with the subfolders).
	 */
	let { model, folder }: { model: DocumentsModel; folder: Folder } = $props();
	const workspace = useWorkspace();
</script>

<DropdownMenu.Item onclick={() => model.togglePin(folder)}>
	{#if model.isPinned(folder)}<PinOff />{workspace.t('ui.ws.documents.unpin')}{:else}<Pin />{workspace.t(
			'ui.ws.documents.pin',
		)}{/if}
</DropdownMenu.Item>
<DropdownMenu.Item onclick={() => model.toggleOffline(folder)}>
	{#if model.isOffline(folder)}<CloudOff />{workspace.t('ui.ws.documents.offline_stop')}{:else}<CloudDownload
		/>{workspace.t('ui.ws.documents.offline_keep')}{/if}
</DropdownMenu.Item>
