<script lang="ts">
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Checkbox } from '@clinks/ui-shared/components/ui/checkbox';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import FormField from '$lib/components/common/FormField.svelte';
	import { SignupForm } from '$lib/features/auth/auth-forms.svelte';
	import { href, navigate } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const form = new SignupForm(workspace);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (await form.submit()) await navigate('/verify-email');
	}
</script>

<AuthShell title={workspace.t('ui.create_account')} description={workspace.t('ui.ws.auth.signup_text')}>
	<form class="space-y-4" onsubmit={submit} novalidate>
		<div class="grid grid-cols-2 gap-3">
			<FormField id="first-name" label={workspace.t('ui.ws.field.first_name')} error={form.fields.firstName}>
				<Input
					id="first-name"
					autocomplete="given-name"
					bind:value={form.firstName}
					aria-invalid={!!form.fields.firstName}
				/>
			</FormField>
			<FormField id="last-name" label={workspace.t('ui.ws.field.last_name')} error={form.fields.lastName}>
				<Input
					id="last-name"
					autocomplete="family-name"
					bind:value={form.lastName}
					aria-invalid={!!form.fields.lastName}
				/>
			</FormField>
		</div>
		<FormField id="email" label={workspace.t('ui.email')} error={form.fields.email}>
			<Input id="email" type="email" autocomplete="email" bind:value={form.email} aria-invalid={!!form.fields.email} />
		</FormField>
		<FormField
			id="password"
			label={workspace.t('ui.password')}
			error={form.fields.password}
			hint={workspace.t('error.ws.password_too_short')}
		>
			<Input
				id="password"
				type="password"
				autocomplete="new-password"
				bind:value={form.password}
				aria-invalid={!!form.fields.password}
			/>
		</FormField>
		<div class="space-y-1">
			<label class="flex items-start gap-2 text-sm">
				<Checkbox bind:checked={form.acceptedTerms} aria-invalid={!!form.fields.terms} />
				<span>{workspace.t('ui.ws.auth.accept_terms')}</span>
			</label>
			{#if form.fields.terms}<p class="text-destructive text-xs" aria-live="polite">{form.fields.terms}</p>{/if}
		</div>
		<Button type="submit" class="w-full" disabled={form.busy}>{workspace.t('ui.create_account')}</Button>
	</form>
	{#snippet footer()}
		{workspace.t('ui.already_have_account')}
		<a class="text-foreground font-medium underline-offset-4 hover:underline" href={href('/login')}>
			{workspace.t('ui.sign_in')}
		</a>
	{/snippet}
</AuthShell>
