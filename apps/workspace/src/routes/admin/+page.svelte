<script lang="ts">
	import { onMount } from 'svelte';
	import Link2 from '@lucide/svelte/icons/link-2';
	import UserCog from '@lucide/svelte/icons/user-cog';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import * as Table from '@clinks/ui-shared/components/ui/table';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Switch } from '@clinks/ui-shared/components/ui/switch';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import SearchInput from '$lib/components/common/SearchInput.svelte';
	import Forbidden from '$lib/components/common/Forbidden.svelte';
	import LocaleSwitch from '$lib/components/shell/LocaleSwitch.svelte';
	import { AdminModel, featureFlags } from '$lib/features/admin/admin.svelte';
	import { landingPath } from '$lib/features/auth/auth-forms.svelte';
	import { navigate } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const session = workspace.session;
	const model = new AdminModel(workspace);
	let ready = $state(false);

	onMount(() => {
		let stop = () => {};
		void session.ready.then(async () => {
			if (session.status !== 'authenticated') {
				await navigate(landingPath(session), { replaceState: true });
				return;
			}
			ready = true;
			if (session.isSuperAdministrator) stop = model.resource.connect();
		});
		return () => stop();
	});

	async function impersonate(tenantId: Parameters<AdminModel['impersonate']>[0]) {
		if (await model.impersonate(tenantId)) await navigate('/dashboard');
	}

	async function signOut() {
		session.signOut();
		await navigate('/login');
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.admin.title')} · CLinks</title></svelte:head>

<header class="flex h-14 items-center gap-3 border-b px-4">
	<span class="bg-foreground text-background grid size-8 place-items-center rounded-lg"><Link2 class="size-4" /></span>
	<span class="font-semibold">{workspace.t('ui.ws.admin.title')}</span>
	<Badge variant="secondary">{workspace.t('ui.super_administrator')}</Badge>
	<div class="flex-1"></div>
	<LocaleSwitch />
	<Button variant="outline" size="sm" onclick={signOut}>{workspace.t('ui.sign_out')}</Button>
</header>
<main class="mx-auto max-w-6xl space-y-6 p-6">
	{#if ready && !session.isSuperAdministrator}
		<Forbidden />
	{:else if ready}
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{workspace.t('ui.tenants')}</h1>
			<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.admin.text')}</p>
		</div>
		<SearchInput bind:value={model.search} label={workspace.t('ui.ws.admin.search')} class="w-full sm:w-72" />
		<AsyncView resource={model.resource}>
			{#snippet children()}
				<Card.Root>
					<Card.Content>
						<Table.Root>
							<Table.Header
								><Table.Row
									><Table.Head>{workspace.t('ui.tenant_name')}</Table.Head><Table.Head
										>{workspace.t('ui.ws.admin.plan')}</Table.Head
									><Table.Head class="text-right">{workspace.t('ui.ws.settings.team')}</Table.Head><Table.Head
										class="text-right">{workspace.t('ui.ws.module.contacts')}</Table.Head
									><Table.Head class="text-right">{workspace.t('ui.ws.command.group_invoices')}</Table.Head
									>{#each featureFlags as flag (flag)}<Table.Head class="text-center"
											>{workspace.t(`ui.ws.admin.flag_${flag}`)}</Table.Head
										>{/each}<Table.Head><span class="sr-only">{workspace.t('ui.action')}</span></Table.Head></Table.Row
								></Table.Header
							>
							<Table.Body>
								{#each model.rows as row (row.tenant.id)}
									<Table.Row>
										<Table.Cell
											><span class="flex items-center gap-2 font-medium"
												><span class="size-2.5 rounded-full" style:background-color={row.tenant.brandColor}></span>{row
													.tenant.name}</span
											><span class="text-muted-foreground text-xs">{workspace.i18n.date(row.tenant.createdAt)}</span
											></Table.Cell
										>
										<Table.Cell
											>{workspace.t(`ui.ws.billing.plan_${row.tenant.plan}`)}{#if row.tenant.trialEndsAt}<span
													class="text-muted-foreground block text-xs"
													>{workspace.t('ui.ws.admin.trial_until', {
														date: workspace.i18n.date(row.tenant.trialEndsAt),
													})}</span
												>{/if}</Table.Cell
										>
										<Table.Cell class="text-right tabular-nums">{row.members}</Table.Cell>
										<Table.Cell class="text-right tabular-nums">{row.contacts}</Table.Cell>
										<Table.Cell class="text-right tabular-nums">{row.invoices}</Table.Cell>
										{#each featureFlags as flag (flag)}
											<Table.Cell class="text-center"
												><Switch
													checked={row.tenant.featureFlags.includes(flag)}
													onCheckedChange={(checked) => model.setFlag(row.tenant.id, flag, checked)}
													aria-label={`${workspace.t(`ui.ws.admin.flag_${flag}`)} · ${row.tenant.name}`}
												/></Table.Cell
											>
										{/each}
										<Table.Cell
											><Button variant="outline" size="sm" onclick={() => impersonate(row.tenant.id)}
												><UserCog class="size-4" />{workspace.t('ui.ws.admin.impersonate')}</Button
											></Table.Cell
										>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</Card.Content>
				</Card.Root>
			{/snippet}
		</AsyncView>
	{/if}
</main>
