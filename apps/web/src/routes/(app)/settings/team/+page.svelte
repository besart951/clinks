<script lang="ts">
	import { onMount } from 'svelte';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import * as Card from '@clinks/ui/components/ui/card';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import * as Table from '@clinks/ui/components/ui/table';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import SearchInput from '#lib/components/common/SearchInput.svelte';
	import StatusBadge from '#lib/components/common/StatusBadge.svelte';
	import PersonAvatar from '#lib/components/common/PersonAvatar.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import { TeamModel } from '#lib/features/settings/settings.svelte';
	import { planFor } from '@clinks/domain/plans';
	import type { RoleId } from '@clinks/domain/ids';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new TeamModel(workspace);
	let inviteOpen = $state(false);
	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => (inviteOpen = true));
		return () => {
			stop();
			stopShortcut();
		};
	});
	const seats = $derived(planFor(workspace.session.tenant?.plan ?? 'starter').includedSeats);

	async function invite(event: SubmitEvent) {
		event.preventDefault();
		if (await model.invite()) inviteOpen = false;
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.settings.team')} · CLinks</title></svelte:head>

<ModuleGate permission="team.manage">
	<PageHeader title={workspace.t('ui.ws.settings.team')} description={workspace.t('ui.ws.team.text')}>
		{#snippet actions()}<Button onclick={() => (inviteOpen = true)} aria-keyshortcuts="N">
				<UserPlus class="size-4" />{workspace.t('ui.invite_user')}
			</Button>{/snippet}
	</PageHeader>
	<AsyncView resource={model.resource}>
		{#snippet children({ invitations, roles })}
			{@const active = (model.resource.data?.members ?? []).filter(
				(member) => member.membership.status === 'active',
			).length}
			<p class="text-muted-foreground mb-3 text-sm">
				{workspace.t('ui.ws.team.seats', { used: active, total: seats })}
			</p>
			<SearchInput bind:value={model.search} label={workspace.t('ui.ws.team.search')} class="mb-3 w-full sm:w-72" />
			<div class="mb-6 rounded-xl border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{workspace.t('ui.ws.contacts.name')}</Table.Head><Table.Head class="hidden md:table-cell">
								{workspace.t('ui.ws.team.job_title')}
							</Table.Head><Table.Head>{workspace.t('ui.role')}</Table.Head><Table.Head class="hidden sm:table-cell">
								{workspace.t('ui.ws.status')}
							</Table.Head><Table.Head class="w-10"><span class="sr-only">{workspace.t('ui.action')}</span></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each model.members as member (member.membership.id)}
							{@const isMe = member.user.id === workspace.session.user?.id}
							<Table.Row class={member.membership.status === 'inactive' ? 'opacity-60' : ''}>
								<Table.Cell>
									<div class="flex min-w-0 items-center gap-2">
										<PersonAvatar
											person={{
												name: `${member.user.firstName} ${member.user.lastName}`,
												avatarColor: member.user.avatarColor,
												avatarDataUrl: member.user.avatarDataUrl,
											}}
											size="sm"
										/>
										<div class="min-w-0">
											<p class="truncate font-medium">
												{member.user.firstName}
												{member.user.lastName}{#if isMe}
													<span class="text-muted-foreground text-xs">({workspace.t('ui.ws.team.you')})</span>{/if}
											</p>
											<p class="text-muted-foreground max-w-[9rem] truncate text-xs sm:max-w-none">
												{member.user.email}
											</p>
										</div>
									</div>
								</Table.Cell>
								<Table.Cell class="hidden md:table-cell">
									<Input
										class="h-7 w-44"
										value={member.membership.jobTitle}
										onchange={(event) => model.setJobTitle(member.membership.id, event.currentTarget.value)}
										aria-label={workspace.t('ui.ws.team.job_title')}
									/>
								</Table.Cell>
								<Table.Cell>
									<Choice
										class="w-32 sm:w-40"
										size="sm"
										value={member.role.id}
										label={workspace.t('ui.role')}
										options={roles.map((role) => ({ value: role.id, label: role.name }))}
										onchange={(value) => model.changeRole(member.membership.id, value as RoleId)}
									/>
								</Table.Cell>
								<Table.Cell class="hidden sm:table-cell">
									<StatusBadge
										tone={member.membership.status === 'active' ? 'success' : 'neutral'}
										label={workspace.t(`ui.ws.team.status_${member.membership.status}`)}
									/>
								</Table.Cell>
								<Table.Cell>
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}<Button
													{...props}
													variant="ghost"
													size="icon-xs"
													aria-label={workspace.t('ui.ws.more_actions')}
												>
													<Ellipsis class="size-4" />
												</Button>{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											{#if member.membership.status === 'active'}<DropdownMenu.Item
													variant="destructive"
													onclick={() => model.setActive(member.membership.id, false)}
												>
													{workspace.t('ui.ws.team.deactivate')}
												</DropdownMenu.Item>{:else}<DropdownMenu.Item
													onclick={() => model.setActive(member.membership.id, true)}
												>
													{workspace.t('ui.ws.team.reactivate')}
												</DropdownMenu.Item>{/if}
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
			<Card.Root>
				<Card.Header>
					<Card.Title>{workspace.t('ui.ws.team.pending')}</Card.Title><Card.Description>
						{workspace.t('ui.ws.team.pending_text')}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<ul class="divide-y">
						{#each invitations as invitation (invitation.id)}
							<li class="flex flex-wrap items-center gap-3 py-2 text-sm">
								<span class="flex-1 font-medium">{invitation.email}</span>
								<span class="text-muted-foreground">{roles.find((role) => role.id === invitation.roleId)?.name}</span>
								<span class="text-muted-foreground text-xs">
									{workspace.t('ui.ws.team.expires', { date: workspace.i18n.date(invitation.expiresAt) })}
								</span>
								{#if !workspace.remote}<Button
										variant="ghost"
										size="sm"
										href={href(`/invitation/${invitation.id}`)}
										target="_blank"
									>
										<MailOpen class="size-4" />{workspace.t('ui.ws.team.open_link')}
									</Button>{/if}
								<Button variant="ghost" size="sm" onclick={() => model.resend(invitation.id)}>
									{workspace.t('ui.ws.team.resend')}
								</Button>
								<Button variant="ghost" size="sm" class="text-destructive" onclick={() => model.revoke(invitation.id)}>
									{workspace.t('ui.ws.team.revoke')}
								</Button>
							</li>
						{:else}<li class="text-muted-foreground py-2 text-sm">{workspace.t('ui.ws.team.no_pending')}</li>{/each}
					</ul>
				</Card.Content>
			</Card.Root>
		{/snippet}
	</AsyncView>
</ModuleGate>

<Dialog.Root bind:open={inviteOpen}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{workspace.t('ui.invite_user')}</Dialog.Title><Dialog.Description>
				{workspace.t('ui.invite_user_description')}
			</Dialog.Description>
		</Dialog.Header>
		<form id="invite-form" class="space-y-3" onsubmit={invite} novalidate>
			<FormField id="inv-email" label={workspace.t('ui.email')} error={model.fields.email}>
				<Input id="inv-email" type="email" bind:value={model.inviteEmail} aria-invalid={!!model.fields.email} />
			</FormField>
			<FormField id="inv-role" label={workspace.t('ui.role')}>
				<Choice
					id="inv-role"
					bind:value={model.inviteRole}
					placeholder={model.resource.data?.roles.find((role) => role.kind === 'user')?.name}
					options={(model.resource.data?.roles ?? []).map((role) => ({ value: role.id, label: role.name }))}
				/>
			</FormField>
		</form>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (inviteOpen = false)}>{workspace.t('ui.ws.cancel')}</Button><Button
				type="submit"
				form="invite-form"
				disabled={model.busy}
			>
				{workspace.t('ui.send_invitation')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
