<script lang="ts">
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import FormField from '#lib/components/common/FormField.svelte';
	import type { NewsletterFormsModel } from '#lib/features/settings/newsletter-forms.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { model }: { model: NewsletterFormsModel } = $props();
	const workspace = useWorkspace();

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void model.save();
	}
</script>

<Dialog.Root bind:open={() => model.draft !== null, (open) => !open && (model.draft = null)}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-lg">
		{#if model.draft}
			{@const draft = model.draft}
			<Dialog.Header>
				<Dialog.Title>{workspace.t('ui.ws.newsletter_forms.dialog_title')}</Dialog.Title>
				<Dialog.Description>{workspace.t('ui.ws.newsletter_forms.dialog_text')}</Dialog.Description>
			</Dialog.Header>
			<form id="newsletter-form" class="space-y-4" onsubmit={submit} novalidate>
				<FormField
					id="nf-title"
					label={workspace.t('ui.ws.newsletter_forms.form_title')}
					error={model.draftErrors.title}
				>
					<Input id="nf-title" required maxlength={120} bind:value={draft.title} />
				</FormField>
				<FormField id="nf-intro" label={workspace.t('ui.ws.newsletter_forms.intro')}>
					<Textarea id="nf-intro" rows={2} maxlength={1000} bind:value={draft.intro} />
				</FormField>
				<FormField
					id="nf-tags"
					label={workspace.t('ui.ws.newsletter_forms.tags')}
					hint={workspace.t('ui.ws.newsletter_forms.tags_hint')}
					error={model.draftErrors.tags}
				>
					<Input id="nf-tags" autocomplete="off" bind:value={draft.tags} />
				</FormField>
				<FormField
					id="nf-consent"
					label={workspace.t('ui.ws.newsletter_forms.consent')}
					hint={workspace.t('ui.ws.newsletter_forms.consent_hint')}
					error={model.draftErrors.consentText}
				>
					<Textarea id="nf-consent" rows={3} maxlength={1000} bind:value={draft.consentText} />
				</FormField>
			</form>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (model.draft = null)}>{workspace.t('ui.cancel')}</Button>
				<Button type="submit" form="newsletter-form" disabled={model.busy}>{workspace.t('ui.save')}</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
