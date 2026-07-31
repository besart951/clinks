<script lang="ts">
	import type { ApplicationScope, AuthAccessViewModel } from '@clinks/clinks-runtime';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import * as Alert from '@clinks/ui-shared/components/ui/alert';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Label } from '@clinks/ui-shared/components/ui/label';

	let {
		model,
		application,
		errorMessage,
	}: {
		model: AuthAccessViewModel;
		application: ApplicationScope;
		errorMessage: string;
	} = $props();
	const t = (key: string) => useClinksRuntime().translations.t(key);
</script>

<Card.Root class="mx-auto max-w-md p-4 shadow-xl shadow-black/5 sm:p-7">
	<Card.Header class="px-0 pt-0">
		<Badge class="w-fit" variant="secondary">clinks</Badge>
		<Card.Title class="text-3xl"
			>{model.invitationToken || model.registering ? t('ui.register') : t('ui.sign_in')}</Card.Title
		>
		<Card.Description>{t(`ui.application_${application}`)}</Card.Description>
	</Card.Header>
	<Card.Content class="px-0">
		<form
			class="space-y-4"
			onsubmit={(event) => {
				event.preventDefault();
				void model.submit();
			}}
		>
			<div class="grid gap-2">
				<Label for="auth-email">{t('ui.email')}</Label>
				<Input id="auth-email" bind:value={model.email} type="email" required autocomplete="email" />
			</div>
			<div class="grid gap-2">
				<Label for="auth-password">{t('ui.password')}</Label>
				<Input
					id="auth-password"
					bind:value={model.password}
					type="password"
					required
					minlength={12}
					autocomplete={model.registering || model.invitationToken ? 'new-password' : 'current-password'}
				/>
			</div>
			{#if model.registering && !model.invitationToken}
				<div class="grid gap-2">
					<Label for="tenant-name">{t('ui.tenant_name')}</Label>
					<Input id="tenant-name" bind:value={model.tenantName} required minlength={2} />
				</div>
			{/if}
			{#if errorMessage}
				<Alert.Root variant="destructive" aria-live="polite"
					><Alert.Description>{errorMessage}</Alert.Description></Alert.Root
				>
			{/if}
			<Button type="submit" disabled={model.busy} class="w-full">
				{model.busy ? t('ui.loading') : model.invitationToken || model.registering ? t('ui.register') : t('ui.sign_in')}
			</Button>
		</form>
	</Card.Content>
	{#if !model.invitationToken}
		<Card.Footer class="px-0 pb-0">
			<Button type="button" variant="link" class="px-0" onclick={() => model.toggleRegistration()}>
				{model.registering ? t('ui.sign_in') : t('ui.register')}
			</Button>
		</Card.Footer>
	{/if}
</Card.Root>
