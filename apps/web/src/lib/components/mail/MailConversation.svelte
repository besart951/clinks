<script lang="ts">
	import type { Contact, MailMessage } from '@clinks/domain/types';
	import SenderCard from './SenderCard.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';
	import DeliveryNote from './DeliveryNote.svelte';

	/**
	 * The mails of a conversation, oldest first; the earlier ones folded to one line, the newest open. Each
	 * sender's name opens a card about them (`contactFor`).
	 */
	let { mails, contactFor }: { mails: MailMessage[]; contactFor: (mail: MailMessage) => Contact | null } = $props();
	const workspace = useWorkspace();
</script>

{#snippet head(mail: MailMessage)}
	<span class="flex flex-wrap items-baseline gap-x-2 text-sm">
		<SenderCard name={mail.fromName} address={mail.from} contact={contactFor(mail)} />
		<span class="text-muted-foreground">&lt;{mail.from}&gt;</span>
		<span class="text-muted-foreground ms-auto text-xs">{workspace.i18n.dateTime(mail.sentAt)}</span>
	</span>
{/snippet}

<ol class="space-y-3">
	{#each mails as mail, index (mail.id)}
		<li>
			{#if index < mails.length - 1}
				<details class="group rounded-lg border">
					<summary class="hover:bg-muted/60 cursor-pointer list-none rounded-lg px-3 py-2">
						{@render head(mail)}
						<span class="text-muted-foreground block truncate text-xs group-open:hidden">
							{mail.body.replace(/\s+/g, ' ').slice(0, 120)}
						</span>
					</summary>
					<div class="space-y-2 border-t px-3 py-3">
						<p class="text-muted-foreground text-xs">{workspace.t('ui.ws.mail.to')}: {mail.to.join(', ')}</p>
						<p class="text-sm leading-relaxed whitespace-pre-wrap">{mail.body}</p>
					</div>
				</details>
			{:else}
				<article class="space-y-2" aria-label={mail.fromName || mail.from}>
					{@render head(mail)}
					<p class="text-muted-foreground text-xs">
						{workspace.t('ui.ws.mail.to')}: {mail.to.join(', ')}
						<DeliveryNote delivery={mail.delivery} />
					</p>
					<p class="text-sm leading-relaxed whitespace-pre-wrap">{mail.body}</p>
				</article>
			{/if}
		</li>
	{/each}
</ol>
