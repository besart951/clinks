<script lang="ts">
	import { onMount } from 'svelte';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import FileText from '@lucide/svelte/icons/file-text';
	import Unlink from '@lucide/svelte/icons/unlink';
	import { Button } from '@clinks/ui/components/ui/button';
	import { AttachmentsModel, formatBytes } from '#lib/features/collaboration/attachments.svelte';
	import type { AttachmentTarget } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { target }: { target: AttachmentTarget } = $props();
	const workspace = useWorkspace();
	// svelte-ignore state_referenced_locally
	const model = new AttachmentsModel(workspace, target);
	const canWrite = $derived(workspace.session.can('documents.write'));
	let dragging = $state(false);

	onMount(() => model.resource.connect());

	function drop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (canWrite) void model.upload(event.dataTransfer?.files ?? null);
	}
</script>

<section class="space-y-3" aria-label={workspace.t('ui.ws.documents.attachments')}>
	<ul class="divide-y rounded-lg border">
		{#each model.resource.data ?? [] as document (document.id)}
			<li class="flex items-center gap-3 px-3 py-2 text-sm">
				<FileText class="text-muted-foreground size-4 shrink-0" />
				<button
					type="button"
					class="min-w-0 flex-1 truncate text-left font-medium hover:underline"
					onclick={() => workspace.run(() => workspace.documentFiles.save(document))}
				>
					{document.name}
				</button>
				<span class="text-muted-foreground shrink-0 text-xs">
					{formatBytes(document.size, (value) => workspace.i18n.number(value))}
				</span>
				{#if canWrite && !document.locked}
					<Button
						variant="ghost"
						size="icon-xs"
						onclick={() => model.detach(document)}
						aria-label={workspace.t('ui.ws.documents.detach', { name: document.name })}
					>
						<Unlink class="size-3.5" />
					</Button>
				{/if}
			</li>
		{:else}
			<li class="text-muted-foreground px-3 py-4 text-center text-sm">
				{workspace.t('ui.ws.documents.no_attachments')}
			</li>
		{/each}
	</ul>
	{#if canWrite}
		<label
			class="text-muted-foreground hover:bg-muted flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-4 text-center text-sm {dragging
				? 'border-foreground bg-muted'
				: ''}"
			ondragover={(event) => {
				event.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={drop}
		>
			<Paperclip class="size-4" />
			{model.uploading ? workspace.t('ui.loading') : workspace.t('ui.ws.documents.drop_hint')}
			<input type="file" multiple class="sr-only" onchange={(event) => model.upload(event.currentTarget.files)} />
		</label>
	{/if}
</section>
