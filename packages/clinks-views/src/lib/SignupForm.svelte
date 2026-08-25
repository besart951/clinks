<script lang="ts">
	import type { ApplicationScope } from '@clinks/api-client';
	import { useAuth } from '@clinks/auth';
	import { AuthAccessViewModel, useClinksRuntime } from '@clinks/clinks-runtime';
	import * as Alert from '@clinks/ui-shared/components/ui/alert';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Field from '@clinks/ui-shared/components/ui/field';
	import { Input } from '@clinks/ui-shared/components/ui/input';

	let { application }: { application: ApplicationScope } = $props();
	const runtime = useClinksRuntime();
	const auth = useAuth();
	const t = (key: string) => runtime.translations.t(key);
	const model = new AuthAccessViewModel(auth, runtime.translations, () => auth.continueAfterLogin('/dashboard'));
</script>

<form
	onsubmit={(event) => {
		event.preventDefault();
		void model.register();
	}}
>
	<Field.Group>
		<div class="text-center">
			<p class="text-muted-foreground text-sm font-medium">{t(`ui.application_${application}`)}</p>
			<h1 class="mt-2 text-2xl font-semibold tracking-tight">{t('ui.create_account')}</h1>
			<Field.Description class="mt-2">
				{t('ui.already_have_account')}
				<a class="text-foreground underline underline-offset-4" href="/login">{t('ui.sign_in')}</a>
			</Field.Description>
		</div>
		<Field.Field>
			<Field.Label for="signup-tenant">{t('ui.tenant_name')}</Field.Label>
			<Input id="signup-tenant" bind:value={model.tenantName} autocomplete="organization" minlength={2} required />
			<Field.Description>{t('ui.tenant_name_help')}</Field.Description>
		</Field.Field>
		<Field.Field>
			<Field.Label for="signup-email">{t('ui.email')}</Field.Label>
			<Input id="signup-email" bind:value={model.email} type="email" autocomplete="email" required />
		</Field.Field>
		<Field.Field>
			<Field.Label for="signup-password">{t('ui.password')}</Field.Label>
			<Input
				id="signup-password"
				bind:value={model.password}
				type="password"
				autocomplete="new-password"
				minlength={12}
				required
			/>
			<Field.Description>{t('ui.password_requirements')}</Field.Description>
		</Field.Field>
		{#if model.errorMessage}
			<Alert.Root variant="destructive" aria-live="polite"
				><Alert.Description>{model.errorMessage}</Alert.Description></Alert.Root
			>
		{/if}
		<Field.Field
			><Button class="w-full" type="submit" disabled={model.busy}
				>{model.busy ? t('ui.loading') : t('ui.create_account')}</Button
			></Field.Field
		>
	</Field.Group>
</form>
