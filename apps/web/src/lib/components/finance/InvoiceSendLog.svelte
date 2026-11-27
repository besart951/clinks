<script lang="ts">
	import Link from '@lucide/svelte/icons/link';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import type { InvoiceSend } from '@clinks/domain/types';
	import type { InvoiceSendModel } from '#lib/features/finance/invoice-send.svelte';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { model }: { model: InvoiceSendModel } = $props();
	const workspace = useWorkspace();
	const now = Date.now();

	function linkState(send: InvoiceSend) {
		if (send.openedAt)
			return workspace.t('ui.ws.invoice.link_opened', {
				date: workspace.i18n.date(send.openedAt),
				count: send.openCount,
			});
		if (send.linkExpiresAt && new Date(send.linkExpiresAt).getTime() < now)
			return workspace.t('ui.ws.invoice.link_expired');
		return workspace.t('ui.ws.invoice.link_unopened', {
			date: workspace.i18n.date(send.linkExpiresAt ?? send.sentAt),
		});
	}
</script>

{#if model.sends?.length}
	<ul class="space-y-3 text-sm" aria-label={workspace.t('ui.ws.invoice.sends')}>
		{#each model.sends as send (send.id)}
			{@const demo = send.method === 'link' ? model.demoLink(send) : null}
			<li class="flex gap-2">
				{#if send.method === 'link'}<Link class="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
				{:else}<Paperclip class="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />{/if}
				<div class="min-w-0">
					<p class="break-words">
						{#if send.kind === 'reminder'}<span class="font-medium">
								{workspace.t('ui.ws.invoice.reminder_entry', { level: send.level ?? 1 })}:
							</span>{/if}
						{workspace.t('ui.ws.invoice.send_entry', {
							date: workspace.i18n.date(send.sentAt),
							to: send.recipient,
						})}
					</p>
					<p class="text-muted-foreground text-xs">
						{workspace.t('ui.ws.invoice.send_by', {
							method: workspace.t(`ui.ws.invoice.send_${send.method}`),
							name: send.sentBy,
						})}
					</p>
					{#if send.delivery !== 'sent'}<p
							class="text-xs {send.delivery === 'queued' ? 'text-muted-foreground' : 'text-destructive'}"
						>
							{workspace.t(`ui.ws.invoice.delivery.${send.delivery}`)}
						</p>{:else if send.method === 'link'}<p class="text-muted-foreground text-xs">{linkState(send)}</p>{/if}
					{#if demo}<a
							class="text-primary text-xs underline-offset-2 hover:underline"
							href={href(`/invoice-link/${demo}`)}
						>
							{workspace.t('ui.ws.invoice.demo_link')}
						</a>{/if}
				</div>
			</li>
		{/each}
	</ul>
{:else if model.sends}
	<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.invoice.sends_empty')}</p>
{/if}
