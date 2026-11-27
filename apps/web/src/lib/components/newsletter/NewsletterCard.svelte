<script lang="ts">
	import { onMount } from 'svelte';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import SideCard from '@clinks/ui/kit/SideCard.svelte';
	import PastToggle from '@clinks/ui/kit/PastToggle.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import StatusBadge from '#lib/components/common/StatusBadge.svelte';
	import { newsletterTone } from '#lib/components/common/tones';
	import { ConsentModel } from '#lib/features/newsletter/consent.svelte';
	import type { Contact } from '@clinks/domain/types';
	import type { ConsentView } from '@clinks/contracts/newsletter';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** The contact's newsletter status with its proof; newsletters only reach «Angemeldet». */
	let { contact }: { contact: Contact } = $props();
	const workspace = useWorkspace();
	const model = new ConsentModel(workspace, () => contact.id);
	const status = $derived(contact.newsletter ?? 'none');
	const history = $derived(model.history.data ?? []);
	onMount(() => model.history.connect());

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void model.save();
	}
</script>

{#snippet entry(item: ConsentView)}
	<li class="text-[13px]">
		<span class="font-medium">{workspace.t(`ui.ws.newsletter.status.${item.status}`)}</span>
		· {workspace.t(`ui.ws.newsletter.source.${item.source}`)} · {workspace.i18n.dateTime(item.createdAt)}
		{#if item.note || item.actorName}
			<span class="text-muted-foreground block">{[item.note, item.actorName].filter(Boolean).join(' · ')}</span>
		{/if}
		{#if item.consentText}<span class="text-muted-foreground block italic">«{item.consentText}»</span>{/if}
	</li>
{/snippet}

<SideCard card={{ title: workspace.t('ui.ws.newsletter.title') }}>
	<div class="flex flex-wrap items-center gap-2">
		<StatusBadge tone={newsletterTone[status]} label={workspace.t(`ui.ws.newsletter.status.${status}`)} />
		{#if workspace.session.can('mail.write')}
			{#if status === 'subscribed'}
				<Button variant="ghost" size="sm" class="ml-auto" onclick={() => model.start('unsubscribed')}>
					{workspace.t('ui.ws.newsletter.unsubscribe')}
				</Button>
			{:else if contact.email}
				<Button variant="ghost" size="sm" class="ml-auto" onclick={() => model.start('subscribed')}>
					{workspace.t('ui.ws.newsletter.record')}
				</Button>
			{/if}
		{/if}
	</div>
	{#if history.length > 0}
		<ul class="grid gap-2">{@render entry(history[0])}</ul>
		{#if history.length > 1}
			<PastToggle label={workspace.t('ui.ws.newsletter.history', { count: history.length - 1 })}>
				<ul class="grid gap-2">
					{#each history.slice(1) as item (item.id)}{@render entry(item)}{/each}
				</ul>
			</PastToggle>
		{/if}
	{/if}
</SideCard>

<Dialog.Root bind:open={() => model.draft !== null, (open) => !open && (model.draft = null)}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-md">
		{#if model.draft}
			{@const draft = model.draft}
			<Dialog.Header>
				<Dialog.Title>
					{workspace.t(draft.status === 'subscribed' ? 'ui.ws.newsletter.record' : 'ui.ws.newsletter.unsubscribe')}
				</Dialog.Title>
				<Dialog.Description>
					{workspace.t(
						draft.status === 'subscribed' ? 'ui.ws.newsletter.record_text' : 'ui.ws.newsletter.unsubscribe_text',
					)}
				</Dialog.Description>
			</Dialog.Header>
			<form id="consent-form" class="space-y-4" onsubmit={submit}>
				<FormField
					id="consent-note"
					label={workspace.t('ui.ws.newsletter.note')}
					hint={workspace.t('ui.ws.newsletter.note_hint')}
					error={model.errors.note}
				>
					<Input id="consent-note" required minlength={3} maxlength={500} bind:value={draft.note} />
				</FormField>
			</form>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (model.draft = null)}>{workspace.t('ui.cancel')}</Button>
				<Button type="submit" form="consent-form" disabled={model.busy}>{workspace.t('ui.save')}</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
