<script lang="ts">
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import Send from '@lucide/svelte/icons/send';
	import FormField from '#lib/components/common/FormField.svelte';
	import type { Invoice } from '@clinks/domain/types';
	import type { DeliveryMethod } from '@clinks/domain/invoicing';
	import type { InvoiceSendModel } from '#lib/features/finance/invoice-send.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { model, invoice }: { model: InvoiceSendModel; invoice: Invoice } = $props();
	const workspace = useWorkspace();
	const methods: DeliveryMethod[] = ['link', 'attachment'];

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void model.submit(invoice);
	}
</script>

<Dialog.Root bind:open={model.open}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>
				{model.reminder
					? workspace.t('ui.ws.invoice.remind_title', { level: model.reminder.level, number: invoice.number })
					: workspace.t('ui.ws.invoice.send_title', { number: invoice.number })}
			</Dialog.Title>
			<Dialog.Description>
				{workspace.t('ui.ws.invoice.send_from', {
					tenant: workspace.session.tenant?.name ?? '',
					reply_to: model.replyTo,
				})}
			</Dialog.Description>
		</Dialog.Header>
		<form id="invoice-send" class="space-y-4" onsubmit={submit}>
			{#if model.reminder}
				<p class="bg-muted rounded-lg p-3 text-sm">
					{workspace.t(model.reminder.fee > 0 ? 'ui.ws.invoice.remind_terms_fee' : 'ui.ws.invoice.remind_terms', {
						fee: workspace.i18n.money(model.reminder.fee),
						due: workspace.i18n.date(model.reminder.dueDate),
					})}
				</p>
			{/if}
			<FormField id="send-to" label={workspace.t('ui.ws.invoice.send_to')}>
				<Input id="send-to" type="email" autocomplete="off" required bind:value={model.to} />
			</FormField>
			<fieldset class="space-y-2">
				<legend class="mb-2 text-sm font-medium">{workspace.t('ui.ws.invoice.send_method')}</legend>
				{#each methods as method (method)}
					<label
						class="has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-ring/50 flex cursor-pointer gap-3 rounded-lg border p-3 text-sm has-[:focus-visible]:ring-[3px]"
					>
						<input
							type="radio"
							name="send-method"
							value={method}
							class="accent-primary mt-0.5 size-4 shrink-0"
							bind:group={model.method}
						/>
						<span>
							<span class="block font-medium">{workspace.t(`ui.ws.invoice.send_${method}`)}</span>
							<span class="text-muted-foreground block">
								{method === 'link'
									? workspace.t('ui.ws.invoice.send_link_hint', { zip: model.zip || '–' })
									: workspace.t('ui.ws.invoice.send_attachment_hint')}
							</span>
						</span>
					</label>
				{/each}
			</fieldset>
			{#if model.blocked}
				<p class="text-destructive text-sm" role="alert">{workspace.t('ui.ws.invoice.send_link_no_zip')}</p>
			{/if}
		</form>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (model.open = false)}>{workspace.t('ui.ws.cancel')}</Button>
			<Button type="submit" form="invoice-send" disabled={model.blocked || model.busy}>
				<Send class="size-4" />{workspace.t(model.reminder ? 'ui.ws.invoice.remind' : 'ui.ws.invoice.send')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
