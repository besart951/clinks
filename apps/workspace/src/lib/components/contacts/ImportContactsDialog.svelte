<script lang="ts">
	import Upload from '@lucide/svelte/icons/upload';
	import * as Dialog from '@clinks/ui-shared/components/ui/dialog';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Textarea } from '@clinks/ui-shared/components/ui/textarea';
	import { contactsFromCsv, parseCsv } from '$lib/features/contacts/csv';
	import { contactName } from '$lib/data/workspace-api';
	import type { Contact } from '$lib/domain/types';
	import type { Draft } from '$lib/data/repository';
	import { useWorkspace } from '$lib/workspace.svelte';

	let { open = $bindable(false), onImport }: { open: boolean; onImport: (drafts: Draft<Contact>[]) => Promise<boolean> } = $props();
	const workspace = useWorkspace();
	const sample = 'Vorname;Nachname;E-Mail;Telefon;Strasse;PLZ;Ort\nLea;Graf;lea.graf@example.ch;+41 32 555 12 12;Seestrasse 4;2502;Biel/Bienne';
	let text = $state('');
	let busy = $state(false);
	const drafts = $derived(contactsFromCsv(parseCsv(text)));
	const valid = $derived(drafts.filter((draft) => (draft.kind === 'person' ? draft.lastName : draft.companyName)));

	async function readFile(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		if (file) text = await file.text();
	}

	async function submit() {
		busy = true;
		const ok = await onImport(valid);
		busy = false;
		if (ok) {
			open = false;
			text = '';
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{workspace.t('ui.ws.contacts.import_title')}</Dialog.Title>
			<Dialog.Description>{workspace.t('ui.ws.contacts.import_text')}</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-3">
			<div class="flex flex-wrap items-center gap-2">
				<label class="border-input hover:bg-muted inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
					<Upload class="size-4" />{workspace.t('ui.ws.contacts.choose_file')}
					<input type="file" accept=".csv,text/csv" class="sr-only" onchange={readFile} />
				</label>
				<Button variant="ghost" size="sm" onclick={() => (text = sample)}>{workspace.t('ui.ws.contacts.use_sample')}</Button>
			</div>
			<Textarea rows={5} bind:value={text} class="font-mono text-xs" aria-label={workspace.t('ui.ws.contacts.csv_content')} placeholder={sample} />
			{#if drafts.length > 0}
				<p class="text-sm">{workspace.t('ui.ws.contacts.import_preview', { valid: valid.length, total: drafts.length })}</p>
				<ul class="max-h-40 divide-y overflow-y-auto rounded-lg border text-sm">
					{#each drafts.slice(0, 20) as draft, index (index)}
						<li class="flex justify-between gap-2 px-3 py-1.5">
							<span class:text-destructive={!valid.includes(draft)}>{contactName(draft) || workspace.t('ui.ws.contacts.missing_name')}</span>
							<span class="text-muted-foreground truncate">{draft.email} {draft.address.city}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>{workspace.t('ui.ws.cancel')}</Button>
			<Button disabled={valid.length === 0 || busy} onclick={submit}>{workspace.t('ui.ws.contacts.import_submit', { count: valid.length })}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
