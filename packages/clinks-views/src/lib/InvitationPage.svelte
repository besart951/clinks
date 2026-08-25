<script lang="ts">
	import type { ApplicationScope } from '@clinks/api-client';
	import { useAuth } from '@clinks/auth';
	import { AuthAccessViewModel, useClinksRuntime } from '@clinks/clinks-runtime';
	import * as Alert from '@clinks/ui-shared/components/ui/alert';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Field from '@clinks/ui-shared/components/ui/field';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { onMount } from 'svelte';
	import AuthPageShell from './AuthPageShell.svelte';

	export interface InvitationFlow {
		token: string;
		returnPath: string;
		completed?: boolean;
		authenticationFailed?: boolean;
	}

	let { application, flow }: { application: ApplicationScope; flow: InvitationFlow } = $props();
	const runtime = useClinksRuntime();
	const auth = useAuth();
	const t = (key: string) => runtime.translations.t(key);
	const model = new AuthAccessViewModel(auth, runtime.translations, () => auth.navigate('/dashboard'));

	onMount(async () => {
		await auth.initialize();
		if (flow.completed && auth.status === 'authenticated') await auth.navigate('/dashboard');
	});

	function startGoogle() {
		auth.startGoogle({ mode: 'invite', returnTo: flow.returnPath, invitationToken: flow.token });
	}
</script>

<svelte:head><title>{t('ui.invitation_meta_title')}</title></svelte:head>

<AuthPageShell {application}>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void model.acceptInvitation(flow.token);
		}}
	>
		<Field.Group>
			<div class="text-center">
				<p class="text-muted-foreground text-sm font-medium">{t(`ui.application_${application}`)}</p>
				<h1 class="mt-2 text-2xl font-semibold tracking-tight">{t('ui.accept_invitation')}</h1>
				<Field.Description class="mt-2">{t('ui.accept_invitation_description')}</Field.Description>
			</div>
			{#if !flow.token}
				<Alert.Root variant="destructive"
					><Alert.Description>{t('error.invitation_invalid')}</Alert.Description></Alert.Root
				>
			{:else}
				{#if flow.authenticationFailed}
					<Alert.Root variant="destructive"
						><Alert.Description>{t('ui.google_authentication_failed')}</Alert.Description></Alert.Root
					>
				{/if}
				{#if auth.status === 'authenticated' && !flow.completed}
					<Alert.Root><Alert.Description>{t('ui.invitation_replaces_session')}</Alert.Description></Alert.Root>
				{/if}
				<Field.Field>
					<Field.Label for="invite-email">{t('ui.email')}</Field.Label>
					<Input id="invite-email" bind:value={model.email} type="email" autocomplete="email" required />
				</Field.Field>
				<Field.Field>
					<Field.Label for="invite-password">{t('ui.password')}</Field.Label>
					<Input
						id="invite-password"
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
						>{model.busy ? t('ui.loading') : t('ui.accept_invitation')}</Button
					></Field.Field
				>
				{#if auth.capabilities.googleOIDCEnabled}
					<Field.Separator>{t('ui.or_continue_with')}</Field.Separator>
					<Field.Field
						><Button class="w-full" variant="outline" type="button" onclick={startGoogle}
							>{t('ui.continue_with_google')}</Button
						></Field.Field
					>
				{/if}
			{/if}
		</Field.Group>
	</form>
</AuthPageShell>
