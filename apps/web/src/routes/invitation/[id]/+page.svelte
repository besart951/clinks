<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Alert from '@clinks/ui/components/ui/alert';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import AuthShell from '#lib/components/auth/AuthShell.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import SkeletonRows from '#lib/components/common/SkeletonRows.svelte';
	import type { InvitationDetails } from '@clinks/contracts/auth';
	import { href, navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	// The demo links by invitation id, the real mail by a one-time token.
	const token = page.params.id ?? '';
	let details = $state<InvitationDetails | null>(null);
	let error = $state('');
	let firstName = $state('');
	let lastName = $state('');
	let password = $state('');
	let busy = $state(false);

	onMount(async () => {
		try {
			details = await workspace.auth.invitationDetails(token);
		} catch (failure) {
			error = workspace.message(failure);
		}
	});

	async function accept(event: SubmitEvent) {
		event.preventDefault();
		if (!details) return;
		busy = true;
		try {
			const accepted = await workspace.auth.acceptInvitation(token, {
				firstName,
				lastName,
				password: details.hasAccount ? undefined : password,
			});
			const session = workspace.session;
			if (accepted.signedInAs) {
				await session.adopt(accepted.signedInAs, accepted.tenantId);
				await navigate('/dashboard');
				return;
			}
			if (session.status === 'authenticated' && session.user?.email === details.email) {
				await session.refresh();
				await session.switchTenant(accepted.tenantId);
				await navigate('/dashboard');
				return;
			}
			toast.success(workspace.t('ui.ws.invitation.accepted_login'));
			await navigate('/login');
		} catch (failure) {
			error = workspace.message(failure);
		} finally {
			busy = false;
		}
	}
</script>

<AuthShell
	title={workspace.t('ui.accept_invitation')}
	description={details
		? workspace.t('ui.ws.invitation.text', { tenant: details.tenantName, role: details.roleName })
		: undefined}
>
	{#if error}
		<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
		<Button href={href('/login')} variant="outline">{workspace.t('ui.ws.auth.back_to_login')}</Button>
	{:else if !details}
		<SkeletonRows rows={2} />
	{:else}
		<form class="space-y-4" onsubmit={accept}>
			<FormField id="iv-email" label={workspace.t('ui.email')}>
				<Input id="iv-email" value={details.email} disabled />
			</FormField>
			{#if !details.hasAccount}
				<div class="grid grid-cols-2 gap-3">
					<FormField id="iv-first" label={workspace.t('ui.ws.field.first_name')}>
						<Input id="iv-first" bind:value={firstName} />
					</FormField>
					<FormField id="iv-last" label={workspace.t('ui.ws.field.last_name')}>
						<Input id="iv-last" bind:value={lastName} />
					</FormField>
				</div>
				<FormField id="iv-password" label={workspace.t('ui.password')}>
					<Input
						id="iv-password"
						type="password"
						autocomplete="new-password"
						minlength={10}
						required
						bind:value={password}
					/>
				</FormField>
			{/if}
			{#if workspace.session.status === 'authenticated' && workspace.session.user?.email !== details.email}<p
					class="text-muted-foreground text-xs"
				>
					{workspace.t('ui.invitation_replaces_session')}
				</p>{/if}
			<Button type="submit" class="w-full" disabled={busy}>{workspace.t('ui.accept_invitation')}</Button>
		</form>
	{/if}
</AuthShell>
