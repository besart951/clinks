<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import Choice from '#lib/components/common/Choice.svelte';
	import type { FolderId } from '@clinks/domain/ids';
	import type { DocumentsModel } from '#lib/features/documents/documents.svelte';
	import { formatBytes } from '#lib/features/collaboration/attachments.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** «In CLinks speichern»: files another app shared into CLinks go into the folder chosen here. */
	let { files = $bindable(), model }: { files: File[]; model: DocumentsModel } = $props();
	const workspace = useWorkspace();
	let folder = $state<string>('root');
	const targets = $derived(model.folderChoices());

	async function save() {
		const target = folder === 'root' ? null : (folder as FolderId);
		const chosen = files;
		files = [];
		model.open(target);
		await model.upload(chosen);
	}
</script>

<Dialog.Root open={files.length > 0} onOpenChange={(open) => !open && (files = [])}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{workspace.t('ui.ws.documents.shared_title')}</Dialog.Title>
			<Dialog.Description>{workspace.t('ui.ws.documents.shared_text', { count: files.length })}</Dialog.Description>
		</Dialog.Header>
		<ul class="space-y-1 text-sm">
			{#each files as file, index (index)}
				<li class="flex items-center gap-2">
					<FileText class="text-muted-foreground size-4 shrink-0" /><span class="min-w-0 flex-1 truncate">
						{file.name}
					</span>
					<span class="text-muted-foreground text-xs">
						{formatBytes(file.size, (value) => workspace.i18n.number(value))}
					</span>
				</li>
			{/each}
		</ul>
		<label class="space-y-1 text-sm">
			<span class="font-medium">{workspace.t('ui.ws.documents.shared_folder')}</span>
			<Choice
				id="shared-folder"
				bind:value={folder}
				options={targets.map((target) => ({ value: target.id ?? 'root', label: target.label }))}
			/>
		</label>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (files = [])}>{workspace.t('ui.ws.cancel')}</Button>
			<Button onclick={save}>{workspace.t('ui.ws.documents.shared_save')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
