<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Newspaper from '@lucide/svelte/icons/newspaper';
	import MailCheck from '@lucide/svelte/icons/mail-check';
	import * as Alert from '@clinks/ui/components/ui/alert';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Checkbox } from '@clinks/ui/components/ui/checkbox';
	import { Input } from '@clinks/ui/components/ui/input';
	import FormField from '#lib/components/common/FormField.svelte';
	import PublicCard from '#lib/components/common/PublicCard.svelte';
	import SkeletonRows from '#lib/components/common/SkeletonRows.svelte';
	import { SignUpModel } from '#lib/features/newsletter/public.svelte';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	// A practice's public newsletter sign-up; double opt-in: nothing is added before the mail's link is clicked.
	const workspace = useWorkspace();
	const model = new SignUpModel(workspace, page.params.token ?? '');
	onMount(() => void model.load());

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void model.submit();
	}
</script>

<PublicCard
	icon={model.sent ? MailCheck : Newspaper}
	title={model.sent ? workspace.t('ui.ws.newsletter_public.check_mail') : (model.form?.title ?? 'CLinks')}
	description={model.sent
		? workspace.t('ui.ws.newsletter_public.check_mail_text', { email: model.value.email })
		: model.form
			? model.form.intro || workspace.t('ui.ws.newsletter_public.intro', { tenant: model.form.tenantName })
			: ''}
>
	{#if model.fatal}
		<Alert.Root variant="destructive"><Alert.Description>{model.fatal}</Alert.Description></Alert.Root>
	{:else if !model.form}
		<SkeletonRows rows={3} />
	{:else if model.sent}
		<p class="text-muted-foreground text-sm" role="status">{workspace.t('ui.ws.newsletter_public.expires')}</p>
		{#if model.demoLink}
			<a class="text-primary text-sm underline-offset-2 hover:underline" href={href(model.demoLink)}>
				{workspace.t('ui.ws.newsletter_public.demo_link')}
			</a>
		{/if}
	{:else}
		<form class="space-y-4" onsubmit={submit}>
			<div class="grid gap-4 sm:grid-cols-2">
				<FormField
					id="nl-first"
					label={workspace.t('ui.ws.newsletter_public.first_name')}
					error={model.fields.firstName}
				>
					<Input id="nl-first" autocomplete="given-name" bind:value={model.value.firstName} />
				</FormField>
				<FormField id="nl-last" label={workspace.t('ui.ws.newsletter_public.last_name')} error={model.fields.lastName}>
					<Input id="nl-last" autocomplete="family-name" bind:value={model.value.lastName} />
				</FormField>
			</div>
			<FormField id="nl-email" label={workspace.t('ui.ws.newsletter_public.email')} error={model.fields.email}>
				<Input
					id="nl-email"
					type="email"
					autocomplete="email"
					spellcheck="false"
					enterkeyhint="done"
					required
					aria-invalid={model.fields.email ? 'true' : undefined}
					bind:value={model.value.email}
				/>
			</FormField>
			<!-- Bots fill in every field; people never see this one. -->
			<div class="sr-only" aria-hidden="true">
				<label for="nl-website">Website</label>
				<input id="nl-website" tabindex="-1" autocomplete="off" bind:value={model.value.website} />
			</div>
			<label class="flex items-start gap-2 text-sm">
				<Checkbox
					bind:checked={model.agreed}
					class="mt-0.5"
					aria-invalid={model.fields.consent ? 'true' : undefined}
					aria-describedby={model.fields.consent ? 'nl-consent-error' : undefined}
				/>
				<span>{model.form.consentText}</span>
			</label>
			{#if model.fields.consent}<p id="nl-consent-error" class="text-destructive text-sm">
					{model.fields.consent}
				</p>{/if}
			<Button type="submit" class="w-full" disabled={model.busy}>
				{workspace.t('ui.ws.newsletter_public.submit')}
			</Button>
			<p class="text-muted-foreground text-xs">
				{workspace.t('ui.ws.newsletter_public.privacy', { tenant: model.form.tenantName })}
			</p>
		</form>
	{/if}
</PublicCard>
