<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import Eye from '@lucide/svelte/icons/eye';
	import { Button } from '@clinks/ui/components/ui/button';
	import type { StoredDocument } from '@clinks/domain/types';
	import type { DocumentsModel } from '#lib/features/documents/documents.svelte';
	import { formatBytes } from '#lib/features/collaboration/attachments.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';
	import DocumentPicture from './DocumentPicture.svelte';

	/** Beside the list on wide screens: the marked file, its picture or first page, its details and links. */
	let {
		document,
		model,
		open,
	}: { document: StoredDocument; model: DocumentsModel; open: (document: StoredDocument) => void } = $props();
	const workspace = useWorkspace();
	const pdf = $derived(document.mimeType === 'application/pdf');
	const contacts = $derived(
		(model.resource.data?.contacts ?? []).filter((contact) =>
			document.targets.some((target) => target.kind === 'contact' && target.id === contact.id),
		),
	);
</script>

<aside
	class="space-y-3 rounded-xl border p-3"
	aria-label={workspace.t('ui.ws.documents.details', { name: document.name })}
>
	{#key document.id}
		{#if pdf}
			{#await model.picture(document) then url}
				<iframe sandbox="" src={url} title={document.name} class="bg-muted/40 h-72 w-full rounded-lg border"></iframe>
			{/await}
		{:else}
			<DocumentPicture {document} {model} class="h-48 rounded-lg border" />
		{/if}
	{/key}
	<div class="space-y-1">
		<h2 class="text-sm font-semibold break-words">{document.name}</h2>
		<p class="text-muted-foreground text-xs">
			{formatBytes(document.size, (value) => workspace.i18n.number(value))} · {workspace.i18n.dateTime(
				document.createdAt,
			)}
		</p>
	</div>
	{#if contacts.length > 0}
		<div class="flex flex-wrap gap-1">
			{#each contacts as contact (contact.id)}<a
					class="bg-muted rounded-full px-2 py-0.5 text-xs hover:underline"
					href={href(`/contacts/${contact.id}`)}
				>
					{contactName(contact)}
				</a>{/each}
		</div>
	{/if}
	<div class="flex gap-2">
		<Button size="sm" variant="outline" onclick={() => open(document)}>
			<Eye class="size-4" />{workspace.t('ui.ws.documents.preview')}
		</Button>
		<Button size="sm" variant="ghost" onclick={() => model.download([document])}>
			<Download class="size-4" />{workspace.t('ui.ws.documents.download')}
		</Button>
	</div>
</aside>
