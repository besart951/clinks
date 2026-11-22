<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PenSquare from '@lucide/svelte/icons/pen-square';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Send from '@lucide/svelte/icons/send';
	import FileText from '@lucide/svelte/icons/file-text';
	import Archive from '@lucide/svelte/icons/archive';
	import Star from '@lucide/svelte/icons/star';
	import Reply from '@lucide/svelte/icons/reply';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import UserRound from '@lucide/svelte/icons/user-round';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import SearchInput from '#lib/components/common/SearchInput.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import MailNav from '#lib/components/mail/MailNav.svelte';
	import ComposeSheet from '#lib/components/mail/ComposeSheet.svelte';
	import { MailboxModel } from '#lib/features/mail/mailbox.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { mailFolders, type MailFolder, type MailMessage } from '#lib/domain/types';
	import type { MailId } from '#lib/domain/ids';
	import { href, navigate, routeQuery, setQuery } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new MailboxModel(workspace);
	const canWrite = $derived(workspace.session.can('mail.write'));
	let compose: ComposeSheet;
	const icons = { inbox: Inbox, sent: Send, drafts: FileText, archive: Archive };
	const query = routeQuery(page.url);
	if (query.get('folder')) model.folder = query.get('folder') as MailFolder;
	if (query.get('message')) model.selectedId = query.get('message') as MailId;

	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && compose.show());
		if (query.get('compose') === '1' && canWrite)
			compose.show({ to: query.get('to') ? [query.get('to')!] : [], subject: query.get('subject') ?? undefined });
		return () => {
			stop();
			stopShortcut();
		};
	});

	function chooseFolder(folder: MailFolder) {
		model.folder = folder;
		model.selectedId = null;
		void setQuery(page.url, { folder: folder === 'inbox' ? null : folder, message: null });
	}

	function open(mail: MailMessage) {
		if (mail.folder === 'drafts' && canWrite) {
			compose.show({ draft: mail });
			return;
		}
		void model.select(mail);
		void setQuery(page.url, { message: mail.id });
	}

	async function toTask(mail: MailMessage) {
		const task = await model.toTask(mail);
		if (task) await navigate(`/planner?task=${task.id}`);
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.module.mail')} · CLinks</title></svelte:head>

<ModuleGate module="mail" permission="mail.read">
	<PageHeader title={workspace.t('ui.ws.module.mail')}>
		{#snippet actions()}
			{#if canWrite}<Button onclick={() => compose.show()} aria-keyshortcuts="N">
					<PenSquare class="size-4" />{workspace.t('ui.ws.command.new_mail')}
				</Button>{/if}
		{/snippet}
	</PageHeader>
	<MailNav />

	<AsyncView resource={model.resource} skeleton="detail">
		{@const selected = model.selected}
		<div class="grid min-h-[60vh] gap-4 lg:grid-cols-[13rem_minmax(18rem,24rem)_1fr]">
			<nav class="flex gap-1 overflow-x-auto lg:flex-col" aria-label={workspace.t('ui.ws.mail.folders')}>
				{#each mailFolders as folder (folder)}
					{@const Icon = icons[folder]}
					<button
						class="hover:bg-muted flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm aria-pressed:bg-muted aria-pressed:font-medium"
						aria-pressed={model.folder === folder}
						onclick={() => chooseFolder(folder)}
					>
						<Icon class="size-4" /><span class="flex-1 text-left">{workspace.t(`ui.ws.mail.folder.${folder}`)}</span>
						{#if folder === 'inbox' && model.unread('inbox') > 0}<span
								class="bg-primary text-primary-foreground rounded-full px-1.5 text-[11px]"
							>
								{model.unread('inbox')}
							</span>{:else if folder === 'drafts' && model.count('drafts') > 0}<span
								class="text-muted-foreground text-xs"
							>
								{model.count('drafts')}
							</span>{/if}
					</button>
				{/each}
			</nav>

			<section
				class="flex min-w-0 flex-col gap-2 {selected ? 'hidden lg:flex' : ''}"
				aria-label={workspace.t(`ui.ws.mail.folder.${model.folder}`)}
			>
				<SearchInput bind:value={model.search} label={workspace.t('ui.ws.mail.search')} />
				<ul class="divide-y overflow-hidden rounded-xl border">
					{#each model.messages as mail (mail.id)}
						<li>
							<button
								class="hover:bg-muted/60 flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm aria-pressed:bg-muted"
								aria-pressed={mail.id === model.selectedId}
								onclick={() => open(mail)}
							>
								<span class="flex items-center gap-2">
									{#if !mail.read}<span
											class="size-2 shrink-0 rounded-full bg-sky-500"
											aria-label={workspace.t('ui.ws.mail.unread')}
										></span>{/if}
									<span class="flex-1 truncate {mail.read ? '' : 'font-semibold'}">
										{mail.folder === 'inbox'
											? mail.fromName
											: mail.to.join(', ') || workspace.t('ui.ws.mail.no_recipient')}
									</span>
									{#if mail.starred}<Star class="size-3.5 fill-amber-400 text-amber-400" />{/if}
									<span class="text-muted-foreground shrink-0 text-xs">{workspace.i18n.relative(mail.sentAt)}</span>
								</span>
								<span class="truncate {mail.read ? 'text-muted-foreground' : 'font-medium'}">
									{mail.subject || workspace.t('ui.ws.mail.no_subject')}
								</span>
								<span class="text-muted-foreground truncate text-xs">
									{mail.body.replace(/\s+/g, ' ').slice(0, 90)}
								</span>
							</button>
						</li>
					{:else}
						<li class="text-muted-foreground px-3 py-10 text-center text-sm">
							{workspace.t('ui.ws.mail.empty_folder')}
						</li>
					{/each}
				</ul>
			</section>

			<article class="min-w-0 rounded-xl border {selected ? '' : 'hidden lg:block'}" aria-live="polite">
				{#if selected}
					{@const contact = model.contactFor(selected)}
					<div class="flex flex-wrap items-center gap-1 border-b p-2">
						<Button
							variant="ghost"
							size="icon-sm"
							class="lg:hidden"
							onclick={() => (model.selectedId = null)}
							aria-label={workspace.t('ui.ws.calendar.previous')}
						>
							<ArrowLeft class="size-4" />
						</Button>
						{#if canWrite}
							<Button variant="ghost" size="sm" onclick={() => compose.show({ replyTo: selected })}>
								<Reply class="size-4" />{workspace.t('ui.ws.mail.reply')}
							</Button>
							{#if selected.folder !== 'archive'}<Button
									variant="ghost"
									size="sm"
									onclick={() => model.moveTo(selected, 'archive')}
								>
									<Archive class="size-4" />{workspace.t('ui.ws.contacts.archive')}
								</Button>{:else}<Button variant="ghost" size="sm" onclick={() => model.moveTo(selected, 'inbox')}>
									<Inbox class="size-4" />{workspace.t('ui.ws.mail.folder.inbox')}
								</Button>{/if}
							<Button
								variant="ghost"
								size="icon-sm"
								onclick={() => model.toggleStar(selected)}
								aria-label={workspace.t('ui.ws.mail.star')}
								aria-pressed={selected.starred}
							>
								<Star class="size-4 {selected.starred ? 'fill-amber-400 text-amber-400' : ''}" />
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								onclick={() => model.markUnread(selected)}
								aria-label={workspace.t('ui.ws.mail.mark_unread')}
							>
								<MailOpen class="size-4" />
							</Button>
							<div class="flex-1"></div>
							{#if workspace.session.can('planner.write') && workspace.session.hasModule('planner')}<Button
									variant="outline"
									size="sm"
									onclick={() => toTask(selected)}
								>
									<SquareKanban class="size-4" />{workspace.t('ui.ws.mail.to_task')}
								</Button>{/if}
							{#if workspace.session.can('calendar.write')}<Button
									variant="outline"
									size="sm"
									onclick={() => navigate(`/calendar?new=1${contact ? `&contact=${contact.id}` : ''}`)}
								>
									<CalendarPlus class="size-4" />{workspace.t('ui.ws.mail.to_appointment')}
								</Button>{/if}
							<Button
								variant="ghost"
								size="icon-sm"
								class="text-destructive"
								onclick={() => model.remove(selected)}
								aria-label={workspace.t('ui.ws.delete')}
							>
								<Trash2 class="size-4" />
							</Button>
						{/if}
					</div>
					<div class="space-y-4 p-5">
						<header class="space-y-1">
							<h2 class="text-lg font-semibold">{selected.subject || workspace.t('ui.ws.mail.no_subject')}</h2>
							<p class="text-sm">
								<span class="font-medium">{selected.fromName}</span>
								<span class="text-muted-foreground">&lt;{selected.from}&gt;</span>
							</p>
							<p class="text-muted-foreground text-xs">
								{workspace.t('ui.ws.mail.to')}: {selected.to.join(', ')} · {workspace.i18n.dateTime(selected.sentAt)}
							</p>
							{#if contact}<a
									class="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs hover:underline"
									href={href(`/contacts/${contact.id}`)}
								>
									<UserRound class="size-3" />{contactName(contact)}
								</a>{/if}
						</header>
						<p class="text-sm leading-relaxed whitespace-pre-wrap">{selected.body}</p>
					</div>
				{:else}
					<EmptyState icon={Inbox} title={workspace.t('ui.ws.mail.nothing_selected')} />
				{/if}
			</article>
		</div>
	</AsyncView>
</ModuleGate>

<ComposeSheet
	bind:this={compose}
	contacts={model.resource.data?.contacts ?? []}
	templates={model.resource.data?.templates ?? []}
	onClose={() => setQuery(page.url, { compose: null, to: null })}
/>
