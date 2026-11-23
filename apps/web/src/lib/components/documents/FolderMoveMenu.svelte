<script lang="ts">
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import { folderPath } from '@clinks/domain/folders';
	import type { FolderId } from '@clinks/domain/ids';
	import type { Folder, StoredDocument } from '@clinks/domain/types';
	import type { DocumentsModel } from '#lib/features/documents/documents.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** "Move to" for a folder or a file; the keyboard alternative to dragging it onto the tree. */
	let { model, folder, document }: { model: DocumentsModel; folder?: Folder; document?: StoredDocument } = $props();
	const workspace = useWorkspace();

	const targets = $derived(
		[
			{ id: null as FolderId | null, label: workspace.t('ui.ws.documents.all_files') },
			...model.folders.map((candidate) => ({
				id: candidate.id as FolderId | null,
				label: folderPath(model.folders, candidate.id)
					.map((part) => part.name)
					.join(' / '),
			})),
		]
			.filter((target) =>
				folder ? model.canMoveFolder(folder, target.id) : document ? document.folderId !== target.id : false,
			)
			.sort((left, right) =>
				left.id === null ? -1 : right.id === null ? 1 : left.label.localeCompare(right.label, 'de'),
			),
	);

	function moveTo(id: FolderId | null) {
		if (folder) void model.moveFolder(folder, id);
		else if (document) void model.move(document, id);
	}
</script>

{#if targets.length > 0}
	<DropdownMenu.Sub>
		<DropdownMenu.SubTrigger>{workspace.t('ui.ws.documents.move_to')}</DropdownMenu.SubTrigger>
		<DropdownMenu.SubContent class="max-h-80 overflow-y-auto">
			{#each targets as target (target.id ?? 'root')}
				<DropdownMenu.Item onclick={() => moveTo(target.id)}>{target.label}</DropdownMenu.Item>
			{/each}
		</DropdownMenu.SubContent>
	</DropdownMenu.Sub>
{/if}
