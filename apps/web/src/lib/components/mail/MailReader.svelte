<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Reply from '@lucide/svelte/icons/reply';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import ListMenuItems from '#lib/components/list/ListMenuItems.svelte';
	import { Button } from '@clinks/ui/components/ui/button';
	import { threadSubject } from '@clinks/domain/mail-threads';
	import type { MailId } from '@clinks/domain/ids';
	import type { MailMessage } from '@clinks/domain/types';
	import type { ListModel } from '#lib/features/list/list-model.svelte';
	import type { MailboxModel } from '#lib/features/mail/mailbox.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';
	import InlineReply from './InlineReply.svelte';
	import MailConversation from './MailConversation.svelte';

	/**
	 * The reading pane: the list's actions for the open conversation, its mails and an answer right below.
	 * `compose` opens the full form.
	 */
	let {
		mail,
		model,
		list,
		compose,
	}: {
		mail: MailMessage;
		model: MailboxModel;
		list: ListModel<MailMessage, MailId>;
		compose: (options: { replyTo: MailMessage; to: string[]; body: string }) => void;
	} = $props();
	const workspace = useWorkspace();
	/** Buttons with a short label spelled out; the others show their icon. */
	const spelled = new Set(['reply', 'archive', 'task', 'appointment']);
	const conversation = $derived(model.conversation(mail));
	const contact = $derived(model.contactFor(mail));
	/** The answer goes to the other side: who wrote the newest received mail, else who the newest one went to. */
	const answered = $derived(conversation.findLast((entry) => entry.folder !== 'sent') ?? mail);
	const answerTo = $derived(answered.folder === 'sent' ? answered.to : [answered.from]);
	const canWrite = $derived(workspace.session.can('mail.write') && mail.folder !== 'drafts');
	/** The phone bar: archive, star and delete; everything else is behind «…». */
	const bar = $derived(list.actionsFor([mail]).filter((action) => ['archive', 'star', 'delete'].includes(action.id)));
	const barButton =
		'flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] active:bg-muted';
</script>

<div class="bg-background sticky top-0 z-[1] flex flex-wrap items-center gap-1 border-b p-2">
	<Button
		variant="ghost"
		size="icon-sm"
		class="lg:hidden"
		onclick={() => {
			model.selectedId = null;
			list.clear();
		}}
		aria-label={workspace.t('ui.ws.calendar.previous')}
	>
		<ArrowLeft class="size-4" />
	</Button>
	{#each list.actionsFor([mail]) as action (action.id)}
		{@const Icon = action.icon([mail])}
		{@const pressed = action.pressed?.([mail])}
		{#if action.destructive}<div class="hidden flex-1 lg:block"></div>{/if}
		<!-- On phones the actions sit in the bar at the bottom, in reach of the thumb. -->
		<Button
			variant="ghost"
			size={spelled.has(action.id) ? 'sm' : 'icon-sm'}
			class="hidden lg:inline-flex {action.destructive ? 'text-destructive' : ''}"
			aria-label={spelled.has(action.id) ? undefined : action.label([mail])}
			title={action.label([mail])}
			aria-pressed={pressed}
			onclick={() => list.run(action, [mail])}
		>
			<Icon class="size-4 {pressed ? action.pressedClass : ''}" />{#if spelled.has(action.id)}{action.label([
					mail,
				])}{/if}
		</Button>
	{/each}
</div>
<div class="space-y-4 p-5 pb-28 lg:pb-5">
	<header class="space-y-1">
		<h2 class="text-lg font-semibold">{threadSubject(mail.subject) || workspace.t('ui.ws.mail.no_subject')}</h2>
		<p class="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
			{#if conversation.length > 1}<span>
					{workspace.t('ui.ws.mail.in_conversation', { count: conversation.length })}
				</span>{/if}
			{#if contact}<a
					class="bg-muted text-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 hover:underline"
					href={href(`/contacts/${contact.id}`)}
				>
					<UserRound class="size-3" />{contactName(contact)}
				</a>{/if}
		</p>
	</header>
	<MailConversation mails={conversation} contactFor={(entry) => model.contactFor(entry)} />
	{#if canWrite}
		{#key answered.id}
			<InlineReply mail={answered} to={answerTo} expand={compose} />
		{/key}
	{/if}
</div>

<!-- Phones: the most used actions at the bottom, the rest behind «…». -->
<div
	class="bg-background/95 fixed inset-x-0 bottom-16 z-20 flex items-stretch justify-around border-t px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:bottom-0 lg:hidden"
	role="toolbar"
	aria-label={workspace.t('ui.ws.mail.actions')}
>
	{#if canWrite}
		<button type="button" class={barButton} onclick={() => document.getElementById('inline-reply')?.focus()}>
			<Reply class="size-5" /><span>{workspace.t('ui.ws.mail.reply')}</span>
		</button>
	{/if}
	{#each bar as action (action.id)}
		{@const Icon = action.icon([mail])}
		{@const pressed = action.pressed?.([mail])}
		<button
			type="button"
			class="{barButton} {action.destructive ? 'text-destructive' : ''}"
			aria-pressed={pressed}
			onclick={() => list.run(action, [mail])}
		>
			<Icon class="size-5 {pressed ? action.pressedClass : ''}" /><span class="truncate">{action.label([mail])}</span>
		</button>
	{/each}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<button {...props} type="button" class={barButton}>
					<Ellipsis class="size-5" /><span>{workspace.t('ui.ws.shell.more')}</span>
				</button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" side="top" class="w-60">
			<ListMenuItems {list} items={[mail]} kind="dropdown" />
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
