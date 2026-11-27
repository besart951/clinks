<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PenSquare from '@lucide/svelte/icons/pen-square';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Star from '@lucide/svelte/icons/star';
	import { Button } from '@clinks/ui/components/ui/button';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import SearchInput from '#lib/components/common/SearchInput.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import { fillViewport } from '#lib/components/common/fill-viewport';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import MailNav from '#lib/components/mail/MailNav.svelte';
	import MailFolders from '#lib/components/mail/MailFolders.svelte';
	import MailReader from '#lib/components/mail/MailReader.svelte';
	import ComposeSheet from '#lib/components/mail/ComposeSheet.svelte';
	import { MailboxModel, type MailView } from '#lib/features/mail/mailbox.svelte';
	import { mailList } from '#lib/features/mail/mail-list.svelte';
	import SelectableList from '#lib/components/list/SelectableList.svelte';
	import ListBar from '#lib/components/list/ListBar.svelte';
	import type { MailMessage } from '@clinks/domain/types';
	import type { MailId } from '@clinks/domain/ids';
	import { routeQuery, setQuery } from '#lib/navigation';
	import { useQuickCreate } from '#lib/features/shell/quick-create.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const quick = useQuickCreate();
	const model = new MailboxModel(workspace);
	const canWrite = $derived(workspace.session.can('mail.write'));
	let compose: ComposeSheet;
	const list = mailList(workspace, model, {
		open,
		reply: (mail) => compose.show({ replyTo: mail }),
		appointment: (mail) => quick.appointment({ contactId: model.contactFor(mail)?.id ?? null }),
	});
	const query = routeQuery(page.url);
	if (query.get('folder')) model.folder = query.get('folder') as MailView;
	if (query.get('message')) model.selectedId = query.get('message') as MailId;
	const canPlan = $derived(workspace.session.can('planner.write') && workspace.session.hasModule('planner'));

	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && compose.show());
		const stopKeys = workspace.registerPageKeys(list);
		// Snoozed mails come back while the page stays open.
		const clock = setInterval(() => model.tick(), 30_000);
		if (query.get('compose') === '1' && canWrite)
			compose.show({ to: query.get('to') ? [query.get('to')!] : [], subject: query.get('subject') ?? undefined });
		return () => {
			stop();
			stopShortcut();
			stopKeys();
			clearInterval(clock);
		};
	});

	function chooseFolder(folder: MailView) {
		model.folder = folder;
		model.selectedId = null;
		list.clear();
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
		{@const selected = list.many ? null : model.selected}
		<div
			class="grid gap-4 lg:grid-cols-[13rem_minmax(18rem,24rem)_1fr] lg:grid-rows-[minmax(0,1fr)]"
			{@attach fillViewport()}
		>
			<MailFolders
				{model}
				choose={chooseFolder}
				drops={{
					task: canPlan ? (mails) => mails.forEach((mail) => void model.toTask(mail)) : undefined,
					appointment: workspace.session.can('calendar.write')
						? (mails) => quick.appointment({ contactId: model.contactFor(mails[0])?.id ?? null })
						: undefined,
				}}
			/>

			<section
				class="flex min-h-0 min-w-0 flex-col gap-2 {selected ? 'hidden lg:flex' : ''}"
				aria-label={workspace.t(`ui.ws.mail.folder.${model.folder}`)}
			>
				<div class="group/search space-y-1">
					<SearchInput bind:value={model.search} label={workspace.t('ui.ws.mail.search')} />
					<!-- The filters, shown while searching. -->
					<p class="text-muted-foreground hidden px-1 text-[11px] group-focus-within/search:block">
						{workspace.t('ui.ws.mail.search_hint')}
					</p>
				</div>
				<ListBar {list} />
				<SelectableList {list} class="min-h-0 flex-1 overflow-y-auto rounded-xl border">
					{#snippet row(mail: MailMessage)}
						<span class="flex flex-col gap-0.5 px-3 py-2.5 text-sm">
							<span class="flex items-center gap-2">
								{#if (model.threadFor(mail)?.unread ?? (mail.read ? 0 : 1)) > 0}<span
										class="size-2 shrink-0 rounded-full bg-sky-500"
										aria-label={workspace.t('ui.ws.mail.unread')}
									></span>{/if}
								<span class="flex-1 truncate {model.threadFor(mail)?.unread ? 'font-semibold' : ''}">
									{mail.folder === 'inbox'
										? mail.fromName
										: mail.to.join(', ') || workspace.t('ui.ws.mail.no_recipient')}
								</span>
								{#if (model.threadFor(mail)?.mails.length ?? 1) > 1}<span
										class="text-muted-foreground text-xs tabular-nums"
										aria-label={workspace.t('ui.ws.mail.in_conversation', {
											count: model.threadFor(mail)!.mails.length,
										})}
									>
										{model.threadFor(mail)!.mails.length}
									</span>{/if}
								{#if mail.starred}<Star class="size-3.5 fill-amber-400 text-amber-400" />{/if}
								<span class="text-muted-foreground shrink-0 text-xs">{workspace.i18n.relative(mail.sentAt)}</span>
							</span>
							<span class="truncate {mail.read ? 'text-muted-foreground' : 'font-medium'}">
								{mail.subject || workspace.t('ui.ws.mail.no_subject')}
							</span>
							<span class="text-muted-foreground truncate text-xs">
								{mail.body.replace(/\s+/g, ' ').slice(0, 90)}
							</span>
						</span>
					{/snippet}
					{#snippet empty()}
						<p class="text-muted-foreground px-3 py-10 text-center text-sm">{workspace.t('ui.ws.mail.empty_folder')}</p>
					{/snippet}
				</SelectableList>
			</section>

			<article
				class="flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-xl border {selected ? '' : 'hidden lg:flex'}"
				aria-live="polite"
			>
				{#if selected}
					<MailReader mail={selected} {model} {list} compose={(options) => compose.show(options)} />
				{:else}
					<!-- The pane already has a border: the empty state fills it without a second, dashed one. -->
					<div class="grid flex-1 place-items-center [&>div]:border-0">
						<EmptyState
							icon={Inbox}
							title={list.many
								? workspace.t('ui.ws.selected', { count: list.selected.length })
								: workspace.t('ui.ws.mail.nothing_selected')}
						/>
					</div>
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
