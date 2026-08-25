<script lang="ts">
	import type { ApplicationScope } from '@clinks/api-client';
	import { activeMembership, Show, useAuth } from '@clinks/auth';
	import { AuthDashboardViewModel, BrowserClipboard, useClinksRuntime } from '@clinks/clinks-runtime';
	import * as Alert from '@clinks/ui-shared/components/ui/alert';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Label } from '@clinks/ui-shared/components/ui/label';
	import * as Select from '@clinks/ui-shared/components/ui/select';
	import Building2 from '@lucide/svelte/icons/building-2';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import { onMount } from 'svelte';
	import ProductHeader from './ProductHeader.svelte';

	let { application }: { application: ApplicationScope } = $props();
	const runtime = useClinksRuntime();
	const auth = useAuth();
	const t = (key: string) => runtime.translations.t(key);
	const model = new AuthDashboardViewModel(runtime.client, auth, runtime.translations, new BrowserClipboard());
	const membership = $derived(activeMembership(auth.current));

	onMount(() => {
		void model.loadRoles();
	});
</script>

<main class="bg-muted/30 text-foreground min-h-screen">
	<div class="bg-background border-b">
		<ProductHeader {application} />
	</div>
	<div class="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
		<div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<Badge variant="secondary">{t('ui.dashboard')}</Badge>
				<h1 class="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{t('ui.welcome')}, {auth.email}</h1>
				<p class="text-muted-foreground mt-2">{t(`ui.dashboard_description_${application}`)}</p>
			</div>
			<Button variant="outline" onclick={() => void model.signOut()}>{t('ui.sign_out')}</Button>
		</div>

		{#if model.errorMessage}
			<Alert.Root class="mt-6" variant="destructive" aria-live="polite"
				><Alert.Description>{model.errorMessage}</Alert.Description></Alert.Root
			>
		{/if}

		<section class="mt-8 grid gap-4 md:grid-cols-3">
			<Card.Root class="rounded-2xl">
				<Card.Header>
					<Building2 class="text-muted-foreground size-5" />
					<Card.Description>{t('ui.active_tenant')}</Card.Description>
					<Card.Title>{auth.activeTenant?.name ?? t('ui.no_active_tenant')}</Card.Title>
				</Card.Header>
			</Card.Root>
			<Card.Root class="rounded-2xl">
				<Card.Header>
					<ShieldCheck class="text-muted-foreground size-5" />
					<Card.Description>{t('ui.role')}</Card.Description>
					<Card.Title>{membership?.role.name ?? t('ui.no_role')}</Card.Title>
				</Card.Header>
			</Card.Root>
			<Card.Root class="rounded-2xl">
				<Card.Header>
					<KeyRound class="text-muted-foreground size-5" />
					<Card.Description>{t('ui.permissions')}</Card.Description>
					<Card.Title>{membership?.role.permissions.length ?? 0}</Card.Title>
				</Card.Header>
			</Card.Root>
		</section>

		<div class="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
			<Card.Root class="rounded-2xl">
				<Card.Header>
					<Card.Title>{t('ui.workspace')}</Card.Title>
					<Card.Description>{t('ui.workspace_description')}</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if auth.memberships.length > 1}
						<div class="grid gap-2">
							<Label for="dashboard-active-tenant">{t('ui.active_tenant')}</Label>
							<Select.Root value={model.selectedTenant} onValueChange={(tenantID) => void model.selectTenant(tenantID)}>
								<Select.Trigger id="dashboard-active-tenant" aria-label={t('ui.active_tenant')}
									>{auth.activeTenant?.name ?? t('ui.active_tenant')}</Select.Trigger
								>
								<Select.Content>
									{#each auth.memberships as item (item.id)}
										<Select.Item value={item.tenant.id}>{item.tenant.name}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					{:else}
						<p class="text-muted-foreground text-sm">{t('ui.single_workspace')}</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root class="rounded-2xl">
				<Card.Header>
					<Card.Title>{t(`ui.dashboard_ready_title_${application}`)}</Card.Title>
					<Card.Description>{t(`ui.dashboard_ready_description_${application}`)}</Card.Description>
				</Card.Header>
			</Card.Root>
		</div>

		<Show policy={{ permissions: ['user.manage', 'role.read'] }}>
			<Card.Root class="mt-6 rounded-2xl">
				<Card.Header>
					<Card.Title>{t('ui.invite_user')}</Card.Title>
					<Card.Description>{t('ui.invite_user_description')}</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<form
						class="grid gap-3 sm:grid-cols-[1fr_13rem_auto]"
						onsubmit={(event) => {
							event.preventDefault();
							void model.inviteMember();
						}}
					>
						<div class="grid gap-2">
							<Label for="dashboard-invite-email">{t('ui.email')}</Label>
							<Input
								id="dashboard-invite-email"
								bind:value={model.invitationEmail}
								type="email"
								autocomplete="email"
								required
							/>
						</div>
						<div class="grid gap-2">
							<Label for="dashboard-invite-role">{t('ui.role')}</Label>
							<Select.Root value={model.invitationRoleId} onValueChange={(roleId) => (model.invitationRoleId = roleId)}>
								<Select.Trigger id="dashboard-invite-role" aria-label={t('ui.role')}
									>{model.roles.find((role) => role.id === model.invitationRoleId)?.name ??
										t('ui.role')}</Select.Trigger
								>
								<Select.Content>
									{#each model.roles as role (role.id)}<Select.Item value={role.id}>{role.name}</Select.Item>{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<Button type="submit" class="self-end" disabled={!model.invitationRoleId}>{t('ui.send_invitation')}</Button>
					</form>
					{#if model.createdInvitation}
						<div class="flex gap-2">
							<Input readonly value={model.createdInvitation.acceptanceUrl} aria-label={t('ui.invitation_link')} />
							<Button variant="outline" onclick={() => void model.copyInvitation()}>{t('ui.copy')}</Button>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</Show>
	</div>
</main>
