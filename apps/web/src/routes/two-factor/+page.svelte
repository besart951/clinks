<script lang="ts">
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import { CodeForm, landingPath } from '#lib/features/auth/auth-forms.svelte';
	import { navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const form = new CodeForm(workspace, (code) => workspace.session.confirmTwoFactor(code));

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (await form.submit()) await navigate(landingPath(workspace.session));
	}

	function cancel() {
		workspace.session.cancelTwoFactor();
		void navigate('/login');
	}
</script>

<AuthShell title={workspace.t('ui.ws.auth.two_factor_title')} description={workspace.t('ui.ws.auth.two_factor_text')}>
	<form class="space-y-4" onsubmit={submit} novalidate>
		<FormField
			id="code"
			label={workspace.t('ui.ws.auth.code')}
			error={form.error}
			hint={workspace.auth.remote ? undefined : workspace.t('ui.ws.auth.two_factor_demo_hint')}
		>
			<Input
				id="code"
				inputmode="numeric"
				autocomplete="one-time-code"
				maxlength={6}
				bind:value={form.code}
				aria-invalid={!!form.error}
			/>
		</FormField>
		<Button type="submit" class="w-full" disabled={form.busy}>{workspace.t('ui.ws.auth.verify_submit')}</Button>
		<Button type="button" variant="ghost" class="w-full" onclick={cancel}>{workspace.t('ui.ws.cancel')}</Button>
	</form>
</AuthShell>
