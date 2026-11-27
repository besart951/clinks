<script lang="ts">
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import FolderInput from '@lucide/svelte/icons/folder-input';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import Files from '@lucide/svelte/icons/files';
	import type { FolderId } from '@clinks/domain/ids';
	import type { Folder } from '@clinks/domain/types';
	import type { DocumentsModel } from '#lib/features/documents/documents.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** "Move to" for a folder; the keyboard alternative to dragging it onto the tree. Files use their list's menu. */
	let { model, folder }: { model: DocumentsModel; folder: Folder } = $props();
	const workspace = useWorkspace();

	const targets = $derived(model.moveTargets({ folder }));

	function moveTo(id: FolderId | null) {
		void model.moveFolder(folder, id);
	}
</script>

{#if targets.length > 0}
	<DropdownMenu.Sub>
		<DropdownMenu.SubTrigger><FolderInput />{workspace.t('ui.ws.documents.move_to')}</DropdownMenu.SubTrigger>
		<DropdownMenu.SubContent class="max-h-80 w-64 overflow-y-auto">
			{#each targets as target (target.id ?? 'root')}
				<DropdownMenu.Item onclick={() => moveTo(target.id)}>
					{#if target.id === null}<Files class="text-muted-foreground" />{:else}<FolderIcon
							class="text-amber-500"
						/>{/if}
					<span class="truncate">{target.label}</span>
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.SubContent>
	</DropdownMenu.Sub>
{/if}
