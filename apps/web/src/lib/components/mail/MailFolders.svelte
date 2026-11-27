<script lang="ts">
	import Inbox from '@lucide/svelte/icons/inbox';
	import Send from '@lucide/svelte/icons/send';
	import FileText from '@lucide/svelte/icons/file-text';
	import Archive from '@lucide/svelte/icons/archive';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import { mailFolders, type MailFolder, type MailMessage } from '@clinks/domain/types';
	import type { MailboxModel, MailView } from '#lib/features/mail/mailbox.svelte';
	import { carriesMails, readMailDrag } from '#lib/features/mail/mail-drag';
	import { useWorkspace } from '#lib/workspace.svelte';

	/**
	 * The folders, with their counts. Mails dragged from the list drop onto Posteingang or Archiv, and while they
	 * are dragged two more targets appear: as a task, as an appointment.
	 */
	let {
		model,
		choose,
		drops,
	}: {
		model: MailboxModel;
		choose: (view: MailView) => void;
		drops: { task?: (mails: MailMessage[]) => void; appointment?: (mails: MailMessage[]) => void };
	} = $props();
	const workspace = useWorkspace();
	const icons = { inbox: Inbox, sent: Send, drafts: FileText, archive: Archive, snoozed: AlarmClock };
	/** The folders, then «Zurückgestellt» when something waits there. */
	const views = $derived<MailView[]>([...mailFolders, ...(model.count('snoozed') > 0 ? ['snoozed' as const] : [])]);
	/** Where mails can be moved by dropping: not into Gesendet or Entwürfe. */
	const droppable = new Set<MailFolder>(['inbox', 'archive']);
	let dragging = $state(false);
	let over = $state<string | null>(null);
	const canWrite = $derived(workspace.session.can('mail.write'));
	const zones = $derived([
		{ id: 'task', icon: SquareKanban, label: 'ui.ws.mail.to_task', run: drops.task },
		{ id: 'appointment', icon: CalendarPlus, label: 'ui.ws.mail.to_appointment', run: drops.appointment },
	]);

	function mailsOf(event: DragEvent): MailMessage[] {
		const ids = new Set(readMailDrag(event));
		return (model.resource.data?.mails ?? []).filter((mail) => ids.has(mail.id));
	}

	function allow(event: DragEvent, target: string) {
		if (!carriesMails(event)) return;
		event.preventDefault();
		over = target;
	}

	/**
	 * A drop zone for dragged mails. Attached by hand: a zone is no control of its own; the same steps are in the
	 * mail's menus for keyboard and touch.
	 */
	function zone(target: string, run: (mails: MailMessage[]) => unknown) {
		return (element: HTMLElement) => {
			const over = (event: DragEvent) => allow(event, target);
			const leave = () => clearOver();
			const dropped = (event: DragEvent) => drop(event, run);
			element.addEventListener('dragover', over);
			element.addEventListener('dragleave', leave);
			element.addEventListener('drop', dropped);
			return () => {
				element.removeEventListener('dragover', over);
				element.removeEventListener('dragleave', leave);
				element.removeEventListener('drop', dropped);
			};
		};
	}

	function clearOver() {
		over = null;
	}

	function drop(event: DragEvent, run: (mails: MailMessage[]) => unknown) {
		event.preventDefault();
		over = null;
		dragging = false;
		const mails = mailsOf(event);
		if (mails.length > 0) void run(mails);
	}
</script>

<svelte:window
	ondragstart={(event) => (dragging = canWrite && carriesMails(event))}
	ondragend={() => {
		dragging = false;
		over = null;
	}}
/>

<nav
	class="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap lg:overflow-y-auto"
	aria-label={workspace.t('ui.ws.mail.folders')}
>
	{#each views as folder (folder)}
		{@const Icon = icons[folder]}
		{@const target = canWrite && folder !== 'snoozed' && droppable.has(folder)}
		<button
			class="hover:bg-muted flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm aria-pressed:bg-muted aria-pressed:font-medium {over ===
			folder
				? 'ring-primary bg-primary/10 ring-2'
				: ''}"
			aria-pressed={model.folder === folder}
			onclick={() => choose(folder)}
			ondragover={target ? (event) => allow(event, folder) : undefined}
			ondragleave={() => (over = null)}
			ondrop={target ? (event) => drop(event, (mails) => model.moveTo(mails, folder as MailFolder)) : undefined}
		>
			<Icon class="size-4" /><span class="flex-1 text-left">{workspace.t(`ui.ws.mail.folder.${folder}`)}</span>
			<!-- Unread in every folder that receives mail; how many there are in Entwürfe and Zurückgestellt. -->
			{#if folder === 'drafts' || folder === 'snoozed'}{#if model.count(folder) > 0}<span
						class="text-muted-foreground text-xs tabular-nums"
					>
						{model.count(folder)}
					</span>{/if}{:else if model.unread(folder) > 0}<span
					class="rounded-full px-1.5 text-[11px] tabular-nums {folder === 'inbox'
						? 'bg-primary text-primary-foreground'
						: 'bg-muted-foreground/15 text-muted-foreground'}"
					aria-label={workspace.t('ui.ws.mail.unread_count', { count: model.unread(folder) })}
				>
					{model.unread(folder)}
				</span>{/if}
		</button>
	{/each}
	{#if dragging}
		<div
			class="mt-2 flex flex-col gap-1 border-t pt-2"
			role="group"
			aria-label={workspace.t('ui.ws.mail.drop_targets')}
		>
			{#each zones as item (item.id)}
				{#if item.run}
					{@const Icon = item.icon}
					{@const run = item.run}
					<div
						class="text-muted-foreground flex items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-sm {over ===
						item.id
							? 'ring-primary bg-primary/10 text-foreground ring-2'
							: ''}"
						{@attach zone(item.id, run)}
					>
						<Icon class="size-4" />{workspace.t(item.label)}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</nav>
