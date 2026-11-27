<script lang="ts">
	import FileButton from '#lib/components/common/FileButton.svelte';
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import Upload from '@lucide/svelte/icons/upload';
	import FileText from '@lucide/svelte/icons/file-text';
	import FileImage from '@lucide/svelte/icons/file-image';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Lock from '@lucide/svelte/icons/lock';
	import PenLine from '@lucide/svelte/icons/pen-line';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
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
	import type { DocumentSortKey } from '#lib/features/documents/document-sort';
	import ViewToggle, { type ListView } from '#lib/components/common/ViewToggle.svelte';
	import DocumentPicture from '#lib/components/documents/DocumentPicture.svelte';
	import DocumentPane from '#lib/components/documents/DocumentPane.svelte';
	import FolderDeviceItems from '#lib/components/documents/FolderDeviceItems.svelte';
	import ShareDialog from '#lib/components/documents/ShareDialog.svelte';
	import ScanDialog from '#lib/components/documents/ScanDialog.svelte';
	import SharedFilesDialog from '#lib/components/documents/SharedFilesDialog.svelte';
	import ScanLine from '@lucide/svelte/icons/scan-line';
	import CloudCheck from '@lucide/svelte/icons/cloud-check';
	import { page } from '$app/state';
	import { routeQuery, setQuery } from '#lib/navigation';
	import Pin from '@lucide/svelte/icons/pin';
	import Clock from '@lucide/svelte/icons/clock';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import { documentList } from '#lib/features/documents/document-list.svelte';
	import { combineKeys, commandKeys } from '#lib/features/shell/page-keys';
	import { printKey } from '#lib/features/list/list-model.svelte';
	import SelectableList from '#lib/components/list/SelectableList.svelte';
	import ListBar from '#lib/components/list/ListBar.svelte';
	import FolderTree, { type FolderTreeActions } from '#lib/components/documents/FolderTree.svelte';
	import FolderMoveMenu from '#lib/components/documents/FolderMoveMenu.svelte';
	import { carriesFiles, carriesItem, readItem, startItemDrag } from '#lib/features/documents/drag-item';
	import { formatBytes } from '#lib/features/collaboration/attachments.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import type { Folder as FolderRecord, StoredDocument } from '@clinks/domain/types';
	import type { ContactId, FolderId } from '@clinks/domain/ids';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new DocumentsModel(workspace);
	const canWrite = $derived(workspace.session.can('documents.write'));
	let preview = $state<(StoredDocument & { text: string }) | null>(null);
	let versioned = $state<StoredDocument | null>(null);
	let versions = $state<import('#lib/data/document-files').DocumentVersion[]>([]);
	async function showPreview(doc: StoredDocument) {
		model.opened(doc);
		preview = await workspace.run(() => workspace.documentFiles.preview(doc));
	}
	async function showVersions(doc: StoredDocument) {
		const list = await workspace.run(() => workspace.documentFiles.versions(doc));
		if (list) {
			versions = list;
			versioned = doc;
		}
	}
	async function replace(doc: StoredDocument, file?: File) {
		if (
			file &&
			(await workspace.run(async () => {
				await workspace.documentFiles.replace(doc, file);
				return true;
			}))
		)
			await showVersions(doc);
	}
	async function restore(doc: StoredDocument, id: string) {
		if (
			await workspace.run(async () => {
				await workspace.documentFiles.restore(doc, id);
				return true;
			})
		)
			await showVersions(doc);
	}
	const list = documentList(workspace, model, {
		preview: showPreview,
		versions: showVersions,
		rename: (document) =>
			ask(workspace.t('ui.ws.documents.rename'), document.name, (name) => model.rename(document, name)),
		link: (document) => (linking = document),
		share: (document) => (sharing = document),
	});
	let sharing = $state<StoredDocument | null>(null);
	let scanning = $state(false);
	/** Files another app shared into CLinks, waiting for a folder. */
	let shared = $state<File[]>([]);
	list.layout = model.view === 'cards' ? 'tiles' : 'rows';
	function setView(view: ListView) {
		model.setView(view);
		list.layout = view === 'cards' ? 'tiles' : 'rows';
	}
	/** The one marked file, shown beside the list on wide screens. */
	const marked = $derived(list.many ? null : (list.selected[0] ?? null));
	/** The path step a dragged file or folder is over. */
	let overCrumb = $state<string | null>(null);
	function allowCrumb(event: DragEvent, target: string) {
		if (!canWrite || !carriesItem(event)) return;
		event.preventDefault();
		overCrumb = target;
	}
	function dropOnCrumb(event: DragEvent, folderId: FolderId | null) {
		const item = readItem(event);
		overCrumb = null;
		if (!item) return;
		event.preventDefault();
		void model.dropInto(item, folderId);
	}
	let naming = $state<{ title: string; value: string; save: (name: string) => Promise<unknown> } | null>(null);
	let linking = $state<StoredDocument | null>(null);
	let linkContact = $state<ContactId | null>(null);
	let confirm = $state<ConfirmRequest | null>(null);
	let dragging = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && fileInput?.click());
		// Opened by «Teilen → CLinks» (manifest share_target): the shared files wait for a folder.
		if (routeQuery(page.url).get('shared') === '1') {
			void workspace.platform.inbox.take().then((files) => (shared = files));
			void setQuery(page.url, { shared: null });
		}
		const stopKeys = workspace.registerPageKeys(
			combineKeys(
				list,
				commandKeys([
					{
						key: 'Backspace',
						shown: printKey('Backspace', (key) => workspace.t(key)),
						label: workspace.t('ui.ws.documents.parent_folder'),
						when: () => model.folderId !== null,
						run: () => model.open(model.path.at(-2)?.id ?? null),
					},
				]),
			),
		);
		return () => {
			stop();
			stopShortcut();
			stopKeys();
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

	let tree = $state<FolderTree>();
	/** Wide screens name the new folder right in the tree; without the tree (narrow screens) a dialog asks. */
	const showsTree = new MediaQuery('min-width: 64rem');

	function newFolder() {
		if (tree && showsTree.current) tree.startCreate(model.folderId);
		else ask(workspace.t('ui.ws.documents.new_folder'), '', (name) => model.createFolder(name, model.folderId));
	}

	const treeActions: FolderTreeActions = {
		remove: (folder) => deleteFolder(folder),
	};
	/** The folder tile a dragged file or folder is over. */
	let overTile = $state<FolderId | null>(null);

	function allowTile(event: DragEvent, folder: FolderRecord) {
		if (!canWrite || !carriesItem(event)) return;
		event.preventDefault();
		event.stopPropagation();
		overTile = folder.id;
	}

	function dropOnTile(event: DragEvent, folder: FolderRecord) {
		const item = readItem(event);
		overTile = null;
		if (!item) return;
		event.preventDefault();
		event.stopPropagation();
		void model.dropInto(item, folder.id);
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
		if (!carriesFiles(event)) return;
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

{#snippet sorter(key: DocumentSortKey, label: string, className = '')}
	{@const active = model.sort.key === key}
	<button
		type="button"
		class="hover:text-foreground inline-flex items-center gap-1 rounded px-1 py-0.5 {active
			? 'text-foreground'
			: ''} {className}"
		aria-pressed={active}
		aria-label={workspace.t('ui.ws.documents.sort_by', { column: workspace.t(label) })}
		onclick={() => model.setSort(key)}
	>
		{workspace.t(label)}
		{#if active}{#if model.sort.dir === 'asc'}<ArrowUp class="size-3" />{:else}<ArrowDown class="size-3" />{/if}{/if}
	</button>
{/snippet}

<svelte:head><title>{workspace.t('ui.ws.module.documents')} · CLinks</title></svelte:head>

<ModuleGate permission="documents.read">
	<PageHeader title={workspace.t('ui.ws.module.documents')} description={workspace.t('ui.ws.documents.description')}>
		{#snippet actions()}
			{#if canWrite}
				<Button variant="outline" onclick={newFolder}>
					<FolderPlus class="size-4" />{workspace.t('ui.ws.documents.new_folder')}
				</Button>
				<Button variant="outline" onclick={() => (scanning = true)}>
					<ScanLine class="size-4" />{workspace.t('ui.ws.documents.scan')}
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
		<div class="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
			<aside class="bg-muted/30 hidden space-y-3 rounded-xl border p-2 lg:sticky lg:top-4 lg:block">
				{#if model.pinnedFolders.length > 0}
					<nav aria-label={workspace.t('ui.ws.documents.pinned')}>
						<h2 class="text-muted-foreground px-2 pb-1 text-xs font-medium">{workspace.t('ui.ws.documents.pinned')}</h2>
						{#each model.pinnedFolders as folder (folder.id)}
							<button
								class="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm aria-pressed:bg-muted"
								aria-pressed={model.folderId === folder.id}
								onclick={() => model.open(folder.id)}
							>
								<Pin class="text-muted-foreground size-3.5 shrink-0" /><span class="truncate">{folder.name}</span>
							</button>
						{/each}
					</nav>
				{/if}
				{#if model.recentFiles.length > 0}
					<nav aria-label={workspace.t('ui.ws.documents.recent')}>
						<h2 class="text-muted-foreground px-2 pb-1 text-xs font-medium">{workspace.t('ui.ws.documents.recent')}</h2>
						{#each model.recentFiles.slice(0, 5) as document (document.id)}
							<button
								class="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm"
								onclick={() => showPreview(document)}
							>
								<Clock class="text-muted-foreground size-3.5 shrink-0" /><span class="truncate">{document.name}</span>
							</button>
						{/each}
					</nav>
				{/if}
				<FolderTree bind:this={tree} {model} actions={treeActions} />
			</aside>
			<div class="min-w-0">
				<div class="mb-4 flex flex-wrap items-center gap-2">
					<nav aria-label={workspace.t('ui.ws.documents.path')} class="flex flex-wrap items-center gap-1 text-sm">
						<!-- Each step of the path takes dropped files and folders, to move them up quickly. -->
						<button
							class="rounded px-1 hover:underline {model.folderId === null ? 'font-semibold' : ''} {overCrumb === 'root'
								? 'bg-primary/10 ring-primary/40 ring-1'
								: ''}"
							onclick={() => model.open(null)}
							ondragover={(event) => allowCrumb(event, 'root')}
							ondragleave={() => (overCrumb = null)}
							ondrop={(event) => dropOnCrumb(event, null)}
						>
							{workspace.t('ui.ws.documents.all_files')}
						</button>
						{#each model.path as folder (folder.id)}
							<ChevronRight class="text-muted-foreground size-3.5" />
							<button
								class="rounded px-1 hover:underline {folder.id === model.folderId ? 'font-semibold' : ''} {overCrumb ===
								folder.id
									? 'bg-primary/10 ring-primary/40 ring-1'
									: ''}"
								onclick={() => model.open(folder.id)}
								ondragover={(event) => allowCrumb(event, folder.id)}
								ondragleave={() => (overCrumb = null)}
								ondrop={(event) => dropOnCrumb(event, folder.id)}
							>
								{folder.name}
							</button>
						{/each}
					</nav>
					<div class="flex-1"></div>
					<SearchInput bind:value={model.search} label={workspace.t('ui.ws.documents.search')} class="w-full sm:w-64" />
					<ViewToggle view={model.view} onchange={setView} />
				</div>

				<section
					class="space-y-4 rounded-xl {dragging ? 'ring-primary ring-2 ring-offset-4' : ''}"
					aria-label={workspace.t('ui.ws.documents.drop_zone')}
					ondragover={(event) => {
						if (!canWrite || !carriesFiles(event)) return;
						event.preventDefault();
						dragging = true;
					}}
					ondragleave={() => (dragging = false)}
					ondrop={drop}
				>
					{#if !model.search && model.children.length > 0}
						<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							{#each model.children as folder (folder.id)}
								<li
									class="hover:bg-muted/60 flex items-center gap-3 rounded-xl border p-3 {overTile === folder.id
										? 'bg-primary/10 ring-primary/40 ring-1'
										: ''}"
									draggable={canWrite}
									ondragstart={(event) => startItemDrag(event, { kind: 'folder', id: folder.id })}
									ondragover={(event) => allowTile(event, folder)}
									ondragleave={() => (overTile = null)}
									ondrop={(event) => dropOnTile(event, folder)}
								>
									<Folder class="size-5 text-amber-500" />
									<button class="min-w-0 flex-1 text-left" onclick={() => model.open(folder.id)}>
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
														aria-label={workspace.t('ui.ws.documents.folder_actions', { name: folder.name })}
													>
														<Ellipsis class="size-4" />
													</Button>{/snippet}
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="end" class="w-52">
												<DropdownMenu.Item
													onclick={() =>
														ask(workspace.t('ui.ws.documents.rename'), folder.name, (name) =>
															model.renameFolder(folder, name),
														)}
												>
													<PenLine />{workspace.t('ui.ws.documents.rename')}
												</DropdownMenu.Item>
												<FolderMoveMenu {model} {folder} />
												<FolderDeviceItems {model} {folder} />
												<DropdownMenu.Separator />
												<DropdownMenu.Item variant="destructive" onclick={() => deleteFolder(folder)}>
													<Trash2 />{workspace.t('ui.ws.delete')}
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
						<ListBar {list} class="mb-2" />
						<div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
							<div class={model.view === 'table' ? 'rounded-xl border' : ''}>
								<div
									class="text-muted-foreground text-xs font-medium {model.view === 'table'
										? 'grid grid-cols-[minmax(0,1fr)_6rem] gap-3 border-b py-1.5 ps-9 pe-3 md:grid-cols-[minmax(0,1fr)_12rem_6rem] lg:grid-cols-[minmax(0,1fr)_12rem_6rem_7rem]'
										: 'mb-2 flex flex-wrap items-center gap-1'}"
									role="group"
									aria-label={workspace.t('ui.ws.documents.sorting')}
								>
									{@render sorter('name', 'ui.ws.contacts.name')}
									{#if model.view === 'table'}<span class="hidden self-center md:block">
											{workspace.t('ui.ws.documents.linked_to')}
										</span>{/if}
									{@render sorter('size', 'ui.ws.documents.size')}
									{@render sorter(
										'createdAt',
										'ui.ws.documents.uploaded_at',
										model.view === 'table' ? 'hidden lg:inline-flex' : '',
									)}
								</div>
								<SelectableList {list}>
									{#snippet row(document: StoredDocument)}
										{#if model.view === 'cards'}
											<span class="flex flex-col">
												<DocumentPicture {document} {model} class="aspect-[4/3] border-b" />
												<span class="space-y-0.5 p-2">
													<span class="block truncate text-sm font-medium">{document.name}</span>
													<span class="text-muted-foreground block text-xs">
														{formatBytes(document.size, (value) => workspace.i18n.number(value))} · {workspace.i18n.date(
															document.createdAt,
														)}
													</span>
												</span>
											</span>
										{:else}
											<span
												class="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 py-2.5 ps-2 pe-3 text-sm md:grid-cols-[minmax(0,1fr)_12rem_6rem] lg:grid-cols-[minmax(0,1fr)_12rem_6rem_7rem]"
											>
												<span class="flex min-w-0 items-center gap-2 font-medium">
													{#if document.mimeType.startsWith('image/')}<FileImage
															class="text-muted-foreground size-4 shrink-0"
														/>{:else}<FileText class="text-muted-foreground size-4 shrink-0" />{/if}
													<span class="min-w-0">
														<span class="block truncate">{document.name}</span>
														{#if model.excerptOf(document)}<span
																class="text-muted-foreground block truncate text-xs font-normal"
															>
																{model.excerptOf(document)}
															</span>{/if}
													</span>
													{#if model.kept(document)}<CloudCheck
															class="text-muted-foreground size-3.5 shrink-0"
															aria-label={workspace.t('ui.ws.documents.offline_kept')}
														/>{/if}
													{#if document.locked}<span
															class="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs font-normal"
															title={workspace.t('ui.ws.documents.archived_hint')}
														>
															<Lock class="size-3" aria-hidden="true" />{workspace.t('ui.ws.documents.archived')}
														</span>{/if}
												</span>
												<span class="hidden min-w-0 flex-wrap gap-1 md:flex">
													{#each linkedContacts(document) as contact (contact.id)}<span
															class="bg-muted truncate rounded-full px-2 py-0.5 text-xs"
														>
															{contactName(contact)}
														</span>{/each}
												</span>
												<span class="text-muted-foreground">
													{formatBytes(document.size, (value) => workspace.i18n.number(value))}
												</span>
												<span class="text-muted-foreground hidden lg:block">
													{workspace.i18n.date(document.createdAt)}
												</span>
											</span>
										{/if}
									{/snippet}
								</SelectableList>
							</div>
							{#if marked}
								<div class="hidden xl:sticky xl:top-4 xl:block">
									<DocumentPane document={marked} {model} open={showPreview} />
								</div>
							{/if}
						</div>
					{/if}
					{#if canWrite}<p class="text-muted-foreground text-xs">
							{workspace.t('ui.ws.documents.drop_page_hint')}
						</p>{/if}
				</section>
			</div>
		</div>
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
					<iframe sandbox="" src={preview.dataUrl} title={preview.name} class="h-[68vh] w-full"></iframe>
				{:else if preview.mimeType.startsWith('text/')}
					<pre class="p-4 text-sm whitespace-pre-wrap">{preview.text}</pre>
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
<ShareDialog bind:document={sharing} />
<ScanDialog bind:open={scanning} folderId={model.folderId} />
<SharedFilesDialog bind:files={shared} {model} />

<Dialog.Root open={versioned !== null} onOpenChange={(open) => !open && (versioned = null)}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')}>
		{#if versioned}{@const doc = versioned}
			<Dialog.Header>
				<Dialog.Title>{workspace.t('ui.ws.documents.versions')}</Dialog.Title><Dialog.Description>
					{doc.name}
				</Dialog.Description>
			</Dialog.Header>
			<ul>
				{#each versions as version (version.id)}<li class="flex items-center justify-between gap-3 py-2">
						{workspace.i18n.dateTime(version.createdAt)}
						{#if canWrite && version.id !== versions[0]?.id}<Button
								variant="outline"
								onclick={() => restore(doc, version.id)}
							>
								{workspace.t('ui.ws.documents.restore_version')}
							</Button>{/if}
					</li>{/each}
			</ul>
			{#if canWrite && !doc.locked}<FileButton
					label={workspace.t('ui.ws.documents.upload_version')}
					onpick={(files) => replace(doc, files[0])}
				/>{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>
