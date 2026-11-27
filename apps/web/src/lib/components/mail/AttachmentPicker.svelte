<script lang="ts">
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import X from '@lucide/svelte/icons/x';
	import * as Popover from '@clinks/ui/components/ui/popover';
	import * as Command from '@clinks/ui/components/ui/command';
	import { Button } from '@clinks/ui/components/ui/button';
	import type { StoredDocument } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Documents attached to a mail, chosen from Dokumente; the server reads them when the mail goes out. */
	let {
		attached,
		onattach,
		ondetach,
	}: {
		attached: StoredDocument[];
		onattach: (document: StoredDocument) => void;
		ondetach: (document: StoredDocument) => void;
	} = $props();

	const workspace = useWorkspace();
	const maxAttachments = 5;
	let open = $state(false);
	let documents = $state.raw<StoredDocument[]>([]);

	async function load(next: boolean) {
		if (next && documents.length === 0)
			documents = (await workspace.api.documents.list()).sort((left, right) =>
				left.name.localeCompare(right.name, 'de'),
			);
	}
</script>

<div class="flex flex-wrap items-center gap-1.5">
	{#each attached as document (document.id)}
		<span class="bg-muted inline-flex max-w-64 items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs">
			<Paperclip class="size-3 shrink-0" /><span class="truncate">{document.name}</span>
			<button
				type="button"
				class="hover:bg-background rounded-full p-0.5"
				onclick={() => ondetach(document)}
				aria-label={workspace.t('ui.ws.mail.attach_remove', { name: document.name })}
			>
				<X class="size-3" />
			</button>
		</span>
	{/each}
	{#if attached.length < maxAttachments}
		<Popover.Root bind:open onOpenChange={load}>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="sm">
						<Paperclip class="size-4" />{workspace.t('ui.ws.mail.attach')}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-72 p-0" align="start">
				<Command.Root>
					<Command.Input placeholder={workspace.t('ui.ws.mail.attach_search')} />
					<Command.List class="max-h-64">
						<Command.Empty>{workspace.t('ui.ws.command.empty')}</Command.Empty>
						{#each documents.filter((document) => !attached.some((candidate) => candidate.id === document.id)) as document (document.id)}
							<Command.Item
								value={`${document.name} ${document.id}`}
								onSelect={() => {
									onattach(document);
									open = false;
								}}
							>
								<span class="truncate">{document.name}</span>
							</Command.Item>
						{/each}
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
	{/if}
</div>
