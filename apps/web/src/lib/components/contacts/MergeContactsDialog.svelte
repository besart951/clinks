<script lang="ts">
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { contactName } from '#lib/data/workspace-api';
	import type { Contact } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	let {
		contacts,
		onMerge,
	}: { contacts: Contact[]; onMerge: (primary: Contact, others: Contact[]) => Promise<boolean> } = $props();
	const workspace = useWorkspace();
	let open = $state(false);
	let primaryId = $state('');
	let busy = $state(false);

	export function show(initial: Contact[]) {
		primaryId = initial[0]?.id ?? '';
		open = true;
	}

	async function merge() {
		const primary = contacts.find((contact) => contact.id === primaryId);
		if (!primary) return;
		busy = true;
		const ok = await onMerge(
			primary,
			contacts.filter((contact) => contact.id !== primaryId),
		);
		busy = false;
		if (ok) open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{workspace.t('ui.ws.contacts.merge_title')}</Dialog.Title>
			<Dialog.Description>{workspace.t('ui.ws.contacts.merge_text')}</Dialog.Description>
		</Dialog.Header>
		<fieldset class="space-y-2">
			<legend class="sr-only">{workspace.t('ui.ws.contacts.merge_keep')}</legend>
			{#each contacts as contact (contact.id)}
				<label
					class="hover:bg-muted flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-foreground"
				>
					<input type="radio" name="primary" value={contact.id} bind:group={primaryId} class="mt-1" />
					<span>
						<span class="block font-medium">{contactName(contact)}</span>
						<span class="text-muted-foreground block">{contact.email || '—'} · {contact.phone || '—'}</span>
						<span class="text-muted-foreground block">
							{contact.address.street}, {contact.address.zip}
							{contact.address.city}
						</span>
					</span>
				</label>
			{/each}
		</fieldset>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>{workspace.t('ui.ws.cancel')}</Button>
			<Button disabled={busy || !primaryId} onclick={merge}>{workspace.t('ui.ws.contacts.merge_submit')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
