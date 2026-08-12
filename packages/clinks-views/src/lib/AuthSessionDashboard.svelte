<script lang="ts">
	import type { AuthDashboardViewModel, AuthPortalViewModel } from '@clinks/clinks-runtime';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import { Show, useAuth } from '@clinks/auth';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Label } from '@clinks/ui-shared/components/ui/label';
	import * as Select from '@clinks/ui-shared/components/ui/select';

	let {
		portalModel,
		dashboardModel,
		signOut,
	}: {
		portalModel: AuthPortalViewModel;
		dashboardModel: AuthDashboardViewModel;
		signOut: () => Promise<void>;
	} = $props();
	const runtime = useClinksRuntime();
	const t = (key: string) => runtime.translations.t(key);
	const session = useAuth();
</script>

<Card.Root class="p-4 sm:p-8">
	<Card.Header class="px-0 pt-0">
		<Badge class="w-fit" variant="secondary">{t('ui.dashboard')}</Badge>
		<Card.Title class="text-3xl">{t('ui.welcome')}, {session.email}</Card.Title>
		<Card.Description>{t(`ui.application_${portalModel.application}`)} {t('ui.connected_to_tenant')}</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-6 px-0">
		{#if session.memberships.length > 1}
			<div class="grid max-w-sm gap-2">
				<Label>{t('ui.active_tenant')}</Label>
				<Select.Root
					value={dashboardModel.selectedTenant}
					onValueChange={(tenantID) => void dashboardModel.selectTenant(tenantID)}
				>
					<Select.Trigger>{session.activeTenant?.name ?? t('ui.active_tenant')}</Select.Trigger>
					<Select.Content>
						{#each session.memberships as membership (membership.id)}
							<Select.Item value={membership.tenant.id}>{membership.tenant.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		{/if}
		<Show policy={{ permissions: ['user.manage', 'role.read'] }}>
			<form
				class="grid max-w-xl gap-3 sm:grid-cols-[1fr_12rem_auto]"
				onsubmit={(event) => {
					event.preventDefault();
					void dashboardModel.inviteMember();
				}}
			>
				<div class="grid gap-2">
					<Label for="invite-email">{t('ui.invite_user')}</Label>
					<Input
						id="invite-email"
						bind:value={dashboardModel.invitationEmail}
						type="email"
						required
						autocomplete="email"
					/>
				</div>
				<div class="grid gap-2">
					<Label for="invite-role">{t('ui.role')}</Label>
					<Select.Root
						value={dashboardModel.invitationRoleId}
						onValueChange={(roleId) => (dashboardModel.invitationRoleId = roleId)}
					>
						<Select.Trigger
							>{dashboardModel.roles.find((role) => role.id === dashboardModel.invitationRoleId)?.name ??
								t('ui.role')}</Select.Trigger
						>
						<Select.Content>
							{#each dashboardModel.roles as role (role.id)}
								<Select.Item value={role.id}>{role.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<Button type="submit" class="self-end" disabled={!dashboardModel.invitationRoleId}>{t('ui.invite_user')}</Button
				>
			</form>
			{#if dashboardModel.createdInvitation}
				<div class="flex max-w-xl gap-2">
					<Input readonly value={dashboardModel.createdInvitation.acceptanceUrl} aria-label={t('ui.invitation_link')} />
					<Button type="button" variant="outline" onclick={() => void dashboardModel.copyInvitation()}
						>{t('ui.copy')}</Button
					>
				</div>
			{/if}
		</Show>
		{#if portalModel.errorMessage}
			<p class="text-destructive text-sm" aria-live="polite">{portalModel.errorMessage}</p>
		{/if}
	</Card.Content>
	<Card.Footer class="px-0 pb-0"><Button onclick={signOut}>{t('ui.sign_out')}</Button></Card.Footer>
</Card.Root>
