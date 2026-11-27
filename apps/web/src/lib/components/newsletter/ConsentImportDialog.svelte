<script lang="ts">
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import FormField from '#lib/components/common/FormField.svelte';
	import type { NewsletterFormsModel } from '#lib/features/settings/newsletter-forms.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Consents gathered before CLinks (old tool, paper): matched to existing contacts by address. */
	let { model }: { model: NewsletterFormsModel } = $props();
	const workspace = useWorkspace();

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void model.runImport();
	}
</script>

<Dialog.Root bind:open={() => model.importing !== null, (open) => !open && (model.importing = null)}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-lg">
		{#if model.importing}
			{@const importing = model.importing}
			<Dialog.Header>
				<Dialog.Title>{workspace.t('ui.ws.newsletter_forms.import')}</Dialog.Title>
				<Dialog.Description>{workspace.t('ui.ws.newsletter_forms.import_text')}</Dialog.Description>
			</Dialog.Header>
			{#if importing.result}
				<p class="text-sm" role="status">
					{workspace.t('ui.ws.newsletter_forms.import_done', { count: importing.result.subscribed })}
				</p>
				{#if importing.result.unknown.length > 0}
					<p class="text-muted-foreground text-sm">
						{workspace.t('ui.ws.newsletter_forms.import_unknown', { addresses: importing.result.unknown.join(', ') })}
					</p>
				{/if}
				<Dialog.Footer>
					<Button onclick={() => (model.importing = null)}>{workspace.t('ui.ws.close')}</Button>
				</Dialog.Footer>
			{:else}
				<form id="consent-import" class="space-y-4" onsubmit={submit}>
					<FormField id="ci-emails" label={workspace.t('ui.ws.newsletter_forms.import_emails')}>
						<Textarea id="ci-emails" rows={6} required spellcheck="false" bind:value={importing.emails} />
					</FormField>
					<FormField
						id="ci-note"
						label={workspace.t('ui.ws.newsletter_forms.import_note')}
						hint={workspace.t('ui.ws.newsletter_forms.import_note_hint')}
					>
						<Input id="ci-note" required minlength={3} maxlength={500} bind:value={importing.note} />
					</FormField>
				</form>
				<Dialog.Footer>
					<Button variant="outline" onclick={() => (model.importing = null)}>{workspace.t('ui.cancel')}</Button>
					<Button type="submit" form="consent-import" disabled={model.busy}>
						{workspace.t('ui.ws.newsletter_forms.import_run')}
					</Button>
				</Dialog.Footer>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>
