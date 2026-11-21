<script lang="ts">
	import MailCheck from '@lucide/svelte/icons/mail-check';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import FormField from '$lib/components/common/FormField.svelte';
	import { PasswordResetForm } from '$lib/features/auth/auth-forms.svelte';
	import { href } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const form = new PasswordResetForm(workspace);

	function request(event: SubmitEvent) {
		event.preventDefault();
		void form.request();
	}

	function reset(event: SubmitEvent) {
		event.preventDefault();
		void form.reset();
	}
</script>

<AuthShell title={workspace.t('ui.ws.auth.forgot_title')} description={workspace.t('ui.ws.auth.forgot_text')}>
	{#if form.step === 'request'}
		<form class="space-y-4" onsubmit={request} novalidate>
			<FormField id="email" label={workspace.t('ui.email')}>
				<Input id="email" type="email" autocomplete="email" bind:value={form.email} />
			</FormField>
			<Button type="submit" class="w-full" disabled={form.busy}>{workspace.t('ui.ws.auth.send_reset')}</Button>
		</form>
	{:else if form.step === 'sent' || form.step === 'reset'}
		<div class="bg-muted/50 flex gap-3 rounded-xl border p-3 text-sm">
			<MailCheck class="mt-0.5 size-4 shrink-0" />
			<p>{workspace.t('ui.ws.auth.reset_sent', { email: form.email })}</p>
		</div>
		<form class="space-y-4" onsubmit={reset} novalidate>
			<FormField id="code" label={workspace.t('ui.ws.auth.code')} error={form.fields.code} hint={workspace.t('ui.ws.auth.verify_demo_hint')}>
				<Input id="code" inputmode="numeric" maxlength={6} bind:value={form.code} />
			</FormField>
			<FormField id="password" label={workspace.t('ui.ws.auth.new_password')} error={form.fields.password}>
				<Input id="password" type="password" autocomplete="new-password" bind:value={form.password} />
			</FormField>
			<Button type="submit" class="w-full" disabled={form.busy}>{workspace.t('ui.ws.auth.set_password')}</Button>
		</form>
	{:else}
		<p class="text-sm">{workspace.t('ui.ws.auth.password_changed')}</p>
		<Button href={href('/login')} class="w-full">{workspace.t('ui.sign_in')}</Button>
	{/if}
	{#snippet footer()}
		<a class="text-foreground font-medium underline-offset-4 hover:underline" href={href('/login')}>{workspace.t('ui.ws.auth.back_to_login')}</a>
	{/snippet}
</AuthShell>
