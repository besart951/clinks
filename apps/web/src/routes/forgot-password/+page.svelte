<script lang="ts">
	import MailCheck from '@lucide/svelte/icons/mail-check';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import { PasswordResetForm } from '#lib/features/auth/auth-forms.svelte';
	import { href, routeQuery } from '#lib/navigation';
	import { page } from '$app/state';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	// The reset mail links here with ?token=…
	const form = new PasswordResetForm(workspace, routeQuery(page.url).get('token'));

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
		{#if !form.fromLink}
			<div class="bg-muted/50 flex gap-3 rounded-xl border p-3 text-sm">
				<MailCheck class="mt-0.5 size-4 shrink-0" />
				<p>{workspace.t('ui.ws.auth.reset_sent', { email: form.email })}</p>
			</div>
		{/if}
		<!-- With the real API the mail holds a link instead of a code, so the form appears once it is opened. -->
		{#if form.fromLink || !workspace.auth.remote}
			<form class="space-y-4" onsubmit={reset} novalidate>
				{#if !form.fromLink}
					<FormField
						id="code"
						label={workspace.t('ui.ws.auth.code')}
						error={form.fields.code}
						hint={workspace.t('ui.ws.auth.verify_demo_hint')}
					>
						<Input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength={6} bind:value={form.code} />
					</FormField>
				{/if}
				<FormField
					id="password"
					label={workspace.t('ui.ws.auth.new_password')}
					error={form.fields.password ?? (form.fromLink ? form.error : undefined)}
				>
					<Input id="password" type="password" autocomplete="new-password" required bind:value={form.password} />
				</FormField>
				<Button type="submit" class="w-full" disabled={form.busy}>{workspace.t('ui.ws.auth.set_password')}</Button>
			</form>
		{/if}
	{:else}
		<p class="text-sm">{workspace.t('ui.ws.auth.password_changed')}</p>
		<Button href={href('/login')} class="w-full">{workspace.t('ui.sign_in')}</Button>
	{/if}
	{#snippet footer()}
		<a class="text-foreground font-medium underline-offset-4 hover:underline" href={href('/login')}>
			{workspace.t('ui.ws.auth.back_to_login')}
		</a>
	{/snippet}
</AuthShell>
