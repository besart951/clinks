<script lang="ts">
	import type { ApplicationScope } from '@clinks/api-client';
	import { useAuth } from '@clinks/auth';
	import { AuthAccessViewModel, useClinksRuntime } from '@clinks/clinks-runtime';
	import * as Alert from '@clinks/ui-shared/components/ui/alert';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Field from '@clinks/ui-shared/components/ui/field';
	import { Input } from '@clinks/ui-shared/components/ui/input';

	let {
		application,
		returnPath,
		authenticationFailed = false,
	}: { application: ApplicationScope; returnPath: string; authenticationFailed?: boolean } = $props();
	const runtime = useClinksRuntime();
	const auth = useAuth();
	const t = (key: string) => runtime.translations.t(key);
	const model = new AuthAccessViewModel(auth, runtime.translations, () => auth.continueAfterLogin('/dashboard'));

	function startGoogle() {
		auth.startGoogle({ mode: 'login', returnTo: returnPath });
	}
</script>

<form
	onsubmit={(event) => {
		event.preventDefault();
		void model.login();
	}}
>
	<Field.Group>
		<div class="text-center">
			<p class="text-muted-foreground text-sm font-medium">{t(`ui.application_${application}`)}</p>
			<h1 class="mt-2 text-2xl font-semibold tracking-tight">{t('ui.welcome_back')}</h1>
			<Field.Description class="mt-2">
				{t('ui.no_account')}
				<a class="text-foreground underline underline-offset-4" href="/signup">{t('ui.register')}</a>
			</Field.Description>
		</div>
		{#if authenticationFailed}
			<Alert.Root variant="destructive"
				><Alert.Description>{t('ui.google_authentication_failed')}</Alert.Description></Alert.Root
			>
		{/if}
		{#if auth.status === 'error'}
			<Alert.Root><Alert.Description>{t('ui.session_unavailable')}</Alert.Description></Alert.Root>
		{/if}
		<Field.Field>
			<Field.Label for="login-email">{t('ui.email')}</Field.Label>
			<Input id="login-email" bind:value={model.email} type="email" autocomplete="email" required />
		</Field.Field>
		<Field.Field>
			<Field.Label for="login-password">{t('ui.password')}</Field.Label>
			<Input id="login-password" bind:value={model.password} type="password" autocomplete="current-password" required />
		</Field.Field>
		{#if model.errorMessage}
			<Alert.Root variant="destructive" aria-live="polite"
				><Alert.Description>{model.errorMessage}</Alert.Description></Alert.Root
			>
		{/if}
		<Field.Field
			><Button class="w-full" type="submit" disabled={model.busy}
				>{model.busy ? t('ui.loading') : t('ui.sign_in')}</Button
			></Field.Field
		>
		{#if auth.capabilities.googleOIDCEnabled}
			<Field.Separator>{t('ui.or_continue_with')}</Field.Separator>
			<Field.Field>
				<Button class="w-full" variant="outline" type="button" onclick={startGoogle}>
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path
							fill="currentColor"
							d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.19-1.79 4.13-1.15 1.15-2.93 2.4-6.05 2.4-4.83 0-8.6-3.89-8.6-8.72s3.77-8.72 8.6-8.72c2.6 0 4.51 1.03 5.91 2.35l2.31-2.31C18.75 1.44 16.13 0 12.48 0 5.87 0 .31 5.39.31 12s5.56 12 12.17 12c3.57 0 6.27-1.17 8.37-3.36 2.16-2.16 2.84-5.21 2.84-7.67 0-.76-.05-1.47-.17-2.05z"
						/></svg
					>
					{t('ui.continue_with_google')}
				</Button>
			</Field.Field>
		{/if}
	</Field.Group>
</form>
