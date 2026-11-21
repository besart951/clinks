<script lang="ts">
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import * as Alert from '@clinks/ui-shared/components/ui/alert';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import DemoAccounts from '$lib/components/auth/DemoAccounts.svelte';
	import FormField from '$lib/components/common/FormField.svelte';
	import { LoginForm, landingPath } from '$lib/features/auth/auth-forms.svelte';
	import { href, navigate } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const form = new LoginForm(workspace);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (await form.submit()) await navigate(landingPath(workspace.session));
	}

	function pick(email: string, password: string) {
		form.email = email;
		form.password = password;
	}
</script>

<AuthShell title={workspace.t('ui.welcome_back')} description={workspace.t('ui.ws.auth.login_text')}>
	<form class="space-y-4" onsubmit={submit} novalidate>
		{#if form.error}
			<Alert.Root variant="destructive" aria-live="polite"
				><Alert.Description>{form.error}</Alert.Description></Alert.Root
			>
		{/if}
		<FormField id="email" label={workspace.t('ui.email')}>
			<Input id="email" type="email" autocomplete="email" bind:value={form.email} required />
		</FormField>
		<FormField id="password" label={workspace.t('ui.password')}>
			<Input id="password" type="password" autocomplete="current-password" bind:value={form.password} required />
		</FormField>
		<div class="flex justify-end text-sm">
			<a
				class="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
				href={href('/forgot-password')}>{workspace.t('ui.ws.auth.forgot_link')}</a
			>
		</div>
		<Button type="submit" class="w-full" disabled={form.busy}
			>{form.busy ? workspace.t('ui.loading') : workspace.t('ui.sign_in')}</Button
		>
	</form>
	<DemoAccounts onPick={pick} />
	{#snippet footer()}
		{workspace.t('ui.no_account')}
		<a class="text-foreground font-medium underline-offset-4 hover:underline" href={href('/signup')}
			>{workspace.t('ui.create_account')}</a
		>
	{/snippet}
</AuthShell>
