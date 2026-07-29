<script lang="ts">
	import type { AdminDashboardViewModel, TranslationBundleViewModel } from '@clinks/clinks-runtime';
	import * as Alert from '@clinks/ui-shared/components/ui/alert';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Label } from '@clinks/ui-shared/components/ui/label';

	let { model, translations }: { model: AdminDashboardViewModel; translations: TranslationBundleViewModel } = $props();
	const t = (key: string) => translations.t(key);
</script>

<Card.Root class="mx-auto max-w-md p-4 shadow-xl shadow-black/5 sm:p-7">
	<Card.Header class="px-0 pt-0">
		<Badge class="w-fit" variant="secondary">clinks</Badge>
		<Card.Title class="text-3xl">{t('ui.admin_login')}</Card.Title>
	</Card.Header>
	<Card.Content class="px-0">
		<form
			class="space-y-4"
			onsubmit={(event) => {
				event.preventDefault();
				void model.login();
			}}
		>
			<div class="grid gap-2">
				<Label for="admin-email">{t('ui.email')}</Label><Input
					id="admin-email"
					bind:value={model.email}
					type="email"
					required
					autocomplete="email"
				/>
			</div>
			<div class="grid gap-2">
				<Label for="admin-password">{t('ui.password')}</Label><Input
					id="admin-password"
					bind:value={model.password}
					type="password"
					required
					autocomplete="current-password"
				/>
			</div>
			{#if model.errorMessage}<Alert.Root variant="destructive" aria-live="polite"
					><Alert.Description>{model.errorMessage}</Alert.Description></Alert.Root
				>{/if}
			<Button type="submit" disabled={model.busy} class="w-full"
				>{model.busy ? t('ui.loading') : t('ui.sign_in')}</Button
			>
		</form>
	</Card.Content>
</Card.Root>
