<script lang="ts">
	import UserRound from '@lucide/svelte/icons/user-round';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import * as HoverCard from '@clinks/ui/components/ui/hover-card';
	import type { Contact } from '@clinks/domain/types';
	import { contactName } from '#lib/data/workspace-api';
	import { SenderCardModel } from '#lib/features/mail/sender-card.svelte';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	/**
	 * The sender's name; pointing at it shows what CLinks knows about them: the contact, the next appointment
	 * and open invoices. An unknown sender can be added as a contact from there.
	 */
	let { name, address, contact }: { name: string; address: string; contact: Contact | null } = $props();
	const workspace = useWorkspace();
	const model = $derived(contact ? new SenderCardModel(workspace, contact) : null);
</script>

<HoverCard.Root openDelay={400} closeDelay={100} onOpenChange={(open) => open && void model?.load()}>
	<HoverCard.Trigger
		class="font-medium underline-offset-2 hover:underline"
		href={contact ? href(`/contacts/${contact.id}`) : undefined}
	>
		{name || address}
	</HoverCard.Trigger>
	<HoverCard.Content class="w-72" side="bottom" align="start">
		<div
			class="space-y-3 text-sm"
			role="group"
			aria-label={workspace.t('ui.ws.mail.sender_card', { name: name || address })}
		>
			<div class="flex items-start gap-2">
				<UserRound class="text-muted-foreground mt-0.5 size-4 shrink-0" />
				<div class="min-w-0">
					<p class="font-medium">{contact ? contactName(contact) : name || address}</p>
					<p class="text-muted-foreground truncate text-xs">{address}</p>
					{#if contact?.phone}<p class="text-muted-foreground text-xs">{contact.phone}</p>{/if}
				</div>
			</div>
			{#if contact && model}
				<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
					{#if model.facts?.next !== undefined && workspace.session.can('calendar.read')}
						<dt class="text-muted-foreground">{workspace.t('ui.ws.mail.sender.next_appointment')}</dt>
						<dd>
							{model.facts?.next
								? `${workspace.i18n.dateTime(model.facts.next.start)} · ${model.facts.next.title}`
								: workspace.t('ui.ws.mail.sender.no_appointment')}
						</dd>
					{/if}
					{#if model.facts?.open}
						<dt class="text-muted-foreground">{workspace.t('ui.ws.mail.sender.open_invoices')}</dt>
						<dd class="tabular-nums">
							{model.facts.open.count} · {workspace.i18n.money(model.facts.open.balance)}
						</dd>
					{/if}
				</dl>
			{:else}
				<p class="text-muted-foreground text-xs">{workspace.t('ui.ws.mail.sender.unknown')}</p>
				{#if workspace.session.can('contacts.write')}
					<a
						class="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
						href={href(`/contacts?new=1&email=${encodeURIComponent(address)}&name=${encodeURIComponent(name)}`)}
					>
						<UserPlus class="size-3.5" />{workspace.t('ui.ws.mail.sender.add_contact')}
					</a>
				{/if}
			{/if}
		</div>
	</HoverCard.Content>
</HoverCard.Root>
