<script lang="ts">
	import { onMount } from 'svelte';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import Upload from '@lucide/svelte/icons/upload';
	import FileText from '@lucide/svelte/icons/file-text';
	import FileImage from '@lucide/svelte/icons/file-image';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Link2 from '@lucide/svelte/icons/link-2';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import * as Table from '@clinks/ui/components/ui/table';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import SearchInput from '#lib/components/common/SearchInput.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import ContactPicker from '#lib/components/common/ContactPicker.svelte';
	import ConfirmDialog, { type ConfirmRequest } from '#lib/components/common/ConfirmDialog.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import { DocumentsModel } from '#lib/features/documents/documents.svelte';
	import { formatBytes } from '#lib/features/collaboration/attachments.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import type { Folder as FolderRecord, StoredDocument } from '@clinks/domain/types';
	import type { ContactId } from '@clinks/domain/ids';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new DocumentsModel(workspace);
	const canWrite = $derived(workspace.session.can('documents.write'));
	let preview = $state<StoredDocument | null>(null);
	let naming = $state<{ title: string; value: string; save: (name: string) => Promise<unknown> } | null>(null);
	let linking = $state<StoredDocument | null>(null);
	let linkContact = $state<ContactId | null>(null);
	let confirm = $state<ConfirmRequest | null>(null);
	let dragging = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && fileInput?.click());
		return () => {
			stop();
			stopShortcut();
		};
	});

	function ask(title: string, value: string, save: (name: string) => Promise<unknown>) {
		naming = { title, value, save };
	}

	async function submitName(event: SubmitEvent) {
		event.preventDefault();
		if (!naming || !naming.value.trim()) return;
		await naming.save(naming.value);
		naming = null;
	}

	function deleteFolder(folder: FolderRecord) {
		confirm = {
			title: workspace.t('ui.ws.documents.delete_folder_title', { name: folder.name }),
			description: workspace.t('ui.ws.documents.delete_folder_text'),
			confirmLabel: workspace.t('ui.ws.delete'),
			destructive: true,
			onConfirm: () => model.deleteFolder(folder),
		};
	}

	async function saveLink() {
		const contact = model.resource.data?.contacts.find((candidate) => candidate.id === linkContact);
		if (linking && contact) await model.link(linking, contact);
		linking = null;
		linkContact = null;
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (canWrite) void model.upload(event.dataTransfer?.files ?? null);
	}

	function linkedContacts(document: StoredDocument) {
		const contacts = model.resource.data?.contacts ?? [];
		return document.targets.flatMap((target) =>
			target.kind === 'contact' ? contacts.filter((contact) => contact.id === target.id) : [],
		);
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.module.documents')} · CLinks</title></svelte:head>

<ModuleGate permission="documents.read">
	<PageHeader title={workspace.t('ui.ws.module.documents')} description={workspace.t('ui.ws.documents.description')}>
		{#snippet actions()}
			{#if canWrite}
				<Button
					variant="outline"
					onclick={() => ask(workspace.t('ui.ws.documents.new_folder'), '', (name) => model.createFolder(name))}
				>
					<FolderPlus class="size-4" />{workspace.t('ui.ws.documents.new_folder')}
				</Button>
				<Button onclick={() => fileInput?.click()} disabled={model.uploading}>
					<Upload class="size-4" />{workspace.t('ui.ws.documents.upload')}
				</Button>
				<input
					bind:this={fileInput}
					type="file"
					multiple
					class="sr-only"
					onchange={(event) => model.upload(event.currentTarget.files)}
				/>
			{/if}
		{/snippet}
	</PageHeader>

	<AsyncView resource={model.resource}>
		<div class="mb-4 flex flex-wrap items-center gap-2">
			<nav aria-label={workspace.t('ui.ws.documents.path')} class="flex flex-wrap items-center gap-1 text-sm">
				<button
					class="hover:underline {model.folderId === null ? 'font-semibold' : ''}"
					onclick={() => (model.folderId = null)}
				>
					{workspace.t('ui.ws.documents.all_files')}
				</button>
				{#each model.path as folder (folder.id)}
					<ChevronRight class="text-muted-foreground size-3.5" />
					<button
						class="hover:underline {folder.id === model.folderId ? 'font-semibold' : ''}"
						onclick={() => (model.folderId = folder.id)}
					>
						{folder.name}
					</button>
				{/each}
			</nav>
			<div class="flex-1"></div>
			<SearchInput bind:value={model.search} label={workspace.t('ui.ws.documents.search')} class="w-full sm:w-64" />
		</div>

		<section
			class="space-y-4 rounded-xl {dragging ? 'ring-primary ring-2 ring-offset-4' : ''}"
			aria-label={workspace.t('ui.ws.documents.drop_zone')}
			ondragover={(event) => {
				if (!canWrite) return;
				event.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={drop}
		>
			{#if !model.search && model.children.length > 0}
				<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{#each model.children as folder (folder.id)}
						<li class="hover:bg-muted/60 flex items-center gap-3 rounded-xl border p-3">
							<Folder class="size-5 text-amber-500" />
							<button class="min-w-0 flex-1 text-left" onclick={() => (model.folderId = folder.id)}>
								<span class="block truncate text-sm font-medium">{folder.name}</span>
								<span class="text-muted-foreground text-xs">
									{workspace.t('ui.ws.documents.file_count', { count: model.count(folder.id) })}
								</span>
							</button>
							{#if canWrite}
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}<Button
												{...props}
												variant="ghost"
												size="icon-xs"
												aria-label={workspace.t('ui.ws.more_actions')}
											>
												<Ellipsis class="size-4" />
											</Button>{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item
											onclick={() =>
												ask(workspace.t('ui.ws.documents.rename'), folder.name, (name) =>
													model.renameFolder(folder, name),
												)}
										>
											{workspace.t('ui.ws.documents.rename')}
										</DropdownMenu.Item>
										<DropdownMenu.Item variant="destructive" onclick={() => deleteFolder(folder)}>
											{workspace.t('ui.ws.delete')}
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if model.files.length === 0}
				<EmptyState
					icon={FileText}
					title={workspace.t('ui.ws.documents.empty_title')}
					description={canWrite ? workspace.t('ui.ws.documents.empty_text') : undefined}
				/>
			{:else}
				<div class="rounded-xl border">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{workspace.t('ui.ws.contacts.name')}</Table.Head>
								<Table.Head class="hidden md:table-cell">{workspace.t('ui.ws.documents.linked_to')}</Table.Head>
								<Table.Head class="hidden sm:table-cell">{workspace.t('ui.ws.documents.size')}</Table.Head>
								<Table.Head class="hidden lg:table-cell">{workspace.t('ui.ws.documents.uploaded_at')}</Table.Head>
								<Table.Head class="w-10"><span class="sr-only">{workspace.t('ui.action')}</span></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each model.files as document (document.id)}
								<Table.Row>
									<Table.Cell>
										<button
											class="flex items-center gap-2 text-left font-medium hover:underline"
											onclick={() => (preview = document)}
										>
											{#if document.mimeType.startsWith('image/')}<FileImage
													class="text-muted-foreground size-4"
												/>{:else}<FileText class="text-muted-foreground size-4" />{/if}
											{document.name}
										</button>
									</Table.Cell>
									<Table.Cell class="hidden md:table-cell">
										<div class="flex flex-wrap gap-1">
											{#each linkedContacts(document) as contact (contact.id)}<a
													class="bg-muted rounded-full px-2 py-0.5 text-xs hover:underline"
													href={href(`/contacts/${contact.id}`)}
												>
													{contactName(contact)}
												</a>{/each}
										</div>
									</Table.Cell>
									<Table.Cell class="text-muted-foreground hidden sm:table-cell">
										{formatBytes(document.size, (value) => workspace.i18n.number(value))}
									</Table.Cell>
									<Table.Cell class="text-muted-foreground hidden lg:table-cell">
										{workspace.i18n.date(document.createdAt)}
									</Table.Cell>
									<Table.Cell>
										<DropdownMenu.Root>
											<DropdownMenu.Trigger>
												{#snippet child({ props })}<Button
														{...props}
														variant="ghost"
														size="icon-xs"
														aria-label={workspace.t('ui.ws.more_actions')}
													>
														<Ellipsis class="size-4" />
													</Button>{/snippet}
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="end">
												<DropdownMenu.Item onclick={() => (preview = document)}>
													{workspace.t('ui.ws.documents.preview')}
												</DropdownMenu.Item>
												<a href={document.dataUrl} download={document.name}>
													<DropdownMenu.Item>{workspace.t('ui.ws.documents.download')}</DropdownMenu.Item>
												</a>
												{#if canWrite}
													<DropdownMenu.Item
														onclick={() =>
															ask(workspace.t('ui.ws.documents.rename'), document.name, (name) =>
																model.rename(document, name),
															)}
													>
														{workspace.t('ui.ws.documents.rename')}
													</DropdownMenu.Item>
													<DropdownMenu.Item onclick={() => (linking = document)}>
														<Link2 class="size-4" />{workspace.t('ui.ws.documents.link_contact')}
													</DropdownMenu.Item>
													<DropdownMenu.Sub>
														<DropdownMenu.SubTrigger>{workspace.t('ui.ws.documents.move_to')}</DropdownMenu.SubTrigger>
														<DropdownMenu.SubContent>
															<DropdownMenu.Item onclick={() => model.move(document, null)}>
																{workspace.t('ui.ws.documents.all_files')}
															</DropdownMenu.Item>
															{#each model.folders as folder (folder.id)}<DropdownMenu.Item
																	onclick={() => model.move(document, folder.id)}
																>
																	{folder.name}
																</DropdownMenu.Item>{/each}
														</DropdownMenu.SubContent>
													</DropdownMenu.Sub>
													<DropdownMenu.Separator />
													<DropdownMenu.Item variant="destructive" onclick={() => model.remove(document)}>
														{workspace.t('ui.ws.delete')}
													</DropdownMenu.Item>
												{/if}
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
			{#if canWrite}<p class="text-muted-foreground text-xs">{workspace.t('ui.ws.documents.drop_page_hint')}</p>{/if}
		</section>
	</AsyncView>
</ModuleGate>

<Dialog.Root open={preview !== null} onOpenChange={(open) => !open && (preview = null)}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-3xl">
		{#if preview}
			<Dialog.Header>
				<Dialog.Title>{preview.name}</Dialog.Title><Dialog.Description>
					{formatBytes(preview.size, (value) => workspace.i18n.number(value))} · {workspace.i18n.dateTime(
						preview.createdAt,
					)}
				</Dialog.Description>
			</Dialog.Header>
			<div class="bg-muted/40 max-h-[70vh] overflow-auto rounded-lg border">
				{#if preview.mimeType.startsWith('image/')}
					<img src={preview.dataUrl} alt={preview.name} class="mx-auto max-h-[68vh]" />
				{:else if preview.mimeType === 'application/pdf'}
					<iframe src={preview.dataUrl} title={preview.name} class="h-[68vh] w-full"></iframe>
				{:else if preview.mimeType.startsWith('text/')}
					<pre class="p-4 text-sm whitespace-pre-wrap">{decodeURIComponent(preview.dataUrl.split(',')[1] ?? '')}</pre>
				{:else}
					<p class="text-muted-foreground p-8 text-center text-sm">{workspace.t('ui.ws.documents.no_preview')}</p>
				{/if}
			</div>
			<Dialog.Footer>
				<Button href={preview.dataUrl} download={preview.name}>{workspace.t('ui.ws.documents.download')}</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={naming !== null} onOpenChange={(open) => !open && (naming = null)}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-sm">
		{#if naming}
			<Dialog.Header><Dialog.Title>{naming.title}</Dialog.Title></Dialog.Header>
			<form id="name-form" onsubmit={submitName}>
				<Input bind:value={naming.value} aria-label={workspace.t('ui.ws.contacts.name')} />
			</form>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (naming = null)}>{workspace.t('ui.ws.cancel')}</Button><Button
					type="submit"
					form="name-form"
				>
					{workspace.t('ui.save')}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={linking !== null} onOpenChange={(open) => !open && (linking = null)}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{workspace.t('ui.ws.documents.link_contact')}</Dialog.Title><Dialog.Description>
				{linking?.name}
			</Dialog.Description>
		</Dialog.Header>
		<ContactPicker bind:value={linkContact} contacts={model.resource.data?.contacts ?? []} allowEmpty={false} />
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (linking = null)}>{workspace.t('ui.ws.cancel')}</Button><Button
				disabled={!linkContact}
				onclick={saveLink}
			>
				{workspace.t('ui.ws.documents.link')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
<ConfirmDialog bind:request={confirm} />
