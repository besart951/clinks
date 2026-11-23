<script lang="ts" module>
	import type { Folder } from '@clinks/domain/types';
	import type { FolderId } from '@clinks/domain/ids';

	/** What the tree asks its page to do; the page owns the dialogs. */
	export interface FolderTreeActions {
		create(parentId: FolderId | null): void;
		rename(folder: Folder): void;
		remove(folder: Folder): void;
	}
</script>

<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import Files from '@lucide/svelte/icons/files';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import FolderMoveMenu from './FolderMoveMenu.svelte';
	import { carriesItem, readItem, startItemDrag } from './drag-item';
	import type { DocumentsModel } from '#lib/features/documents/documents.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { model, actions }: { model: DocumentsModel; actions: FolderTreeActions } = $props();
	const workspace = useWorkspace();
	const canWrite = $derived(workspace.session.can('documents.write'));
	/** The folder (or 'root') a dragged item is over. */
	let over = $state<string | null>(null);

	function allow(event: DragEvent, key: string) {
		if (!canWrite || !carriesItem(event)) return;
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		over = key;
	}

	function leave(event: DragEvent, key: string) {
		if (over === key && !(event.currentTarget as Element).contains(event.relatedTarget as Node | null)) over = null;
	}

	function drop(event: DragEvent, parentId: FolderId | null) {
		const item = readItem(event);
		over = null;
		if (!item) return;
		event.preventDefault();
		event.stopPropagation();
		void model.dropInto(item, parentId);
	}

	const row =
		'group/row flex h-8 items-center gap-1 rounded-md pe-1 text-sm transition-colors hover:bg-muted data-[over]:bg-primary/10 data-[over]:ring-1 data-[over]:ring-primary/40';
	const reveal =
		'opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100';
</script>

<nav aria-label={workspace.t('ui.ws.documents.tree')}>
	<ul class="grid gap-0.5">
		<li>
			<div
				class={row}
				data-over={over === 'root' ? '' : undefined}
				role="presentation"
				ondragover={(event) => allow(event, 'root')}
				ondragleave={(event) => leave(event, 'root')}
				ondrop={(event) => drop(event, null)}
			>
				<button
					type="button"
					class="flex min-w-0 flex-1 items-center gap-2 px-2 text-left {model.folderId === null ? 'font-medium' : ''}"
					aria-current={model.folderId === null ? 'true' : undefined}
					onclick={() => model.open(null)}
				>
					<Files class="text-muted-foreground size-4 shrink-0" />
					<span class="truncate">{workspace.t('ui.ws.documents.all_files')}</span>
				</button>
				{#if canWrite}
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground hover:bg-background grid size-6 place-items-center rounded {reveal}"
						aria-label={workspace.t('ui.ws.documents.new_folder')}
						onclick={() => actions.create(null)}
					>
						<FolderPlus class="size-3.5" />
					</button>
				{/if}
			</div>
		</li>
		{@render branch(null, 0)}
	</ul>
</nav>

{#snippet branch(parentId: FolderId | null, depth: number)}
	{#each model.childrenOf(parentId) as folder (folder.id)}
		{@const children = model.childrenOf(folder.id)}
		{@const open = model.expanded.has(folder.id)}
		{@const current = model.folderId === folder.id}
		<li>
			<div
				class={row}
				style:padding-inline-start="{depth * 14}px"
				data-over={over === folder.id ? '' : undefined}
				role="presentation"
				draggable={canWrite}
				ondragstart={(event) => startItemDrag(event, { kind: 'folder', id: folder.id })}
				ondragover={(event) => allow(event, folder.id)}
				ondragleave={(event) => leave(event, folder.id)}
				ondrop={(event) => drop(event, folder.id)}
			>
				{#if children.length > 0}
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground grid size-6 shrink-0 place-items-center rounded"
						aria-expanded={open}
						aria-label={workspace.t(open ? 'ui.ws.documents.collapse_folder' : 'ui.ws.documents.expand_folder', {
							name: folder.name,
						})}
						onclick={() => model.toggle(folder.id)}
					>
						<ChevronRight class="size-3.5 transition-transform {open ? 'rotate-90' : ''}" />
					</button>
				{:else}
					<span class="size-6 shrink-0"></span>
				{/if}
				<button
					type="button"
					class="flex min-w-0 flex-1 items-center gap-2 text-left {current ? 'font-medium' : ''}"
					aria-current={current ? 'true' : undefined}
					onclick={() => model.open(folder.id)}
				>
					{#if current}<FolderOpen class="size-4 shrink-0 text-amber-500" />{:else}<FolderIcon
							class="size-4 shrink-0 text-amber-500"
						/>{/if}
					<span class="truncate">{folder.name}</span>
					<span class="text-muted-foreground ms-auto text-xs tabular-nums">{model.count(folder.id) || ''}</span>
				</button>
				{#if canWrite}
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground hover:bg-background grid size-6 shrink-0 place-items-center rounded {reveal}"
						aria-label={workspace.t('ui.ws.documents.new_subfolder', { name: folder.name })}
						onclick={() => actions.create(folder.id)}
					>
						<FolderPlus class="size-3.5" />
					</button>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}<button
									{...props}
									type="button"
									class="text-muted-foreground hover:text-foreground hover:bg-background grid size-6 shrink-0 place-items-center rounded {reveal}"
									aria-label={workspace.t('ui.ws.documents.folder_actions', { name: folder.name })}
								>
									<Ellipsis class="size-3.5" />
								</button>{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onclick={() => actions.rename(folder)}>
								{workspace.t('ui.ws.documents.rename')}
							</DropdownMenu.Item>
							<FolderMoveMenu {model} {folder} />
							<DropdownMenu.Separator />
							<DropdownMenu.Item variant="destructive" onclick={() => actions.remove(folder)}>
								{workspace.t('ui.ws.delete')}
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
			</div>
			{#if open && children.length > 0}
				<ul class="grid gap-0.5">{@render branch(folder.id, depth + 1)}</ul>
			{/if}
		</li>
	{/each}
{/snippet}
