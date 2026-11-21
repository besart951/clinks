<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Check from '@lucide/svelte/icons/check';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import * as Tabs from '@clinks/ui-shared/components/ui/tabs';
	import * as Dialog from '@clinks/ui-shared/components/ui/dialog';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Switch } from '@clinks/ui-shared/components/ui/switch';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import FormField from '$lib/components/common/FormField.svelte';
	import StatusBadge from '$lib/components/common/StatusBadge.svelte';
	import ConfirmDialog, { type ConfirmRequest } from '$lib/components/common/ConfirmDialog.svelte';
	import ModuleGate from '$lib/components/shell/ModuleGate.svelte';
	import { BillingModel } from '$lib/features/settings/settings.svelte';
	import { planIncludes, plans, priceFor } from '$lib/domain/plans';
	import { coreModules, moduleKeys, type ModuleKey } from '$lib/domain/types';
	import { routeQuery } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new BillingModel(workspace);
	const tenant = $derived(workspace.session.tenant!);
	const highlight = routeQuery(page.url).get('module') as ModuleKey | null;
	let cardOpen = $state(false);
	let confirm = $state<ConfirmRequest | null>(null);
	let memberCount = $state(1);
	onMount(() => {
		void workspace.account
			.members()
			.then((data) => (memberCount = data.members.filter((member) => member.membership.status === 'active').length))
			.catch(() => undefined);
		return model.history.connect();
	});

	async function saveCard(event: SubmitEvent) {
		event.preventDefault();
		if (await model.savePaymentMethod()) cardOpen = false;
	}

	function askCancel() {
		confirm = {
			title: workspace.t('ui.ws.billing.cancel_title'),
			description: workspace.t('ui.ws.billing.cancel_text'),
			confirmLabel: workspace.t('ui.ws.billing.cancel'),
			destructive: true,
			onConfirm: () => model.cancel(),
		};
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.settings.billing')} · CLinks</title></svelte:head>

<ModuleGate permission="billing.manage">
	<PageHeader
		title={workspace.t('ui.ws.settings.billing')}
		description={workspace.t('ui.ws.billing.text', { seats: memberCount })}
	/>
	{#if highlight}<p class="mb-4 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm">
			{workspace.t('ui.ws.billing.highlight', { module: workspace.t(`ui.ws.module.${highlight}`) })}
		</p>{/if}

	<div class="mb-4 flex items-center justify-between gap-3">
		<h2 class="font-semibold">{workspace.t('ui.ws.billing.plans')}</h2>
		<Tabs.Root bind:value={model.cycle}
			><Tabs.List
				><Tabs.Trigger value="monthly">{workspace.t('ui.ws.billing.monthly')}</Tabs.Trigger><Tabs.Trigger value="yearly"
					>{workspace.t('ui.ws.billing.yearly')}</Tabs.Trigger
				></Tabs.List
			></Tabs.Root
		>
	</div>
	<div class="mb-8 grid gap-4 lg:grid-cols-3">
		{#each plans as plan (plan.code)}
			{@const current = tenant.plan === plan.code}
			<Card.Root class={current ? 'border-foreground ring-foreground ring-1' : ''}>
				<Card.Header>
					<Card.Title>{workspace.t(`ui.ws.billing.plan_${plan.code}`)}</Card.Title>
					<Card.Description>{workspace.t(`ui.ws.billing.plan_${plan.code}_text`)}</Card.Description>
					{#if current}<Card.Action
							><StatusBadge tone="success" label={workspace.t('ui.ws.billing.current')} /></Card.Action
						>{/if}
				</Card.Header>
				<Card.Content class="space-y-4">
					<p>
						<span class="text-2xl font-semibold">{workspace.i18n.money(priceFor(plan, memberCount, model.cycle))}</span>
						<span class="text-muted-foreground text-sm"
							>{workspace.t(model.cycle === 'yearly' ? 'ui.ws.billing.per_year' : 'ui.ws.billing.per_month')}</span
						>
					</p>
					<p class="text-muted-foreground text-xs">
						{workspace.t('ui.ws.billing.price_detail', {
							price: workspace.i18n.money(plan.monthlyPricePerSeat),
							seats: plan.includedSeats,
						})}
					</p>
					<ul class="space-y-1 text-sm">
						{#each plan.modules as module (module)}<li
								class="flex items-center gap-2 {module === highlight ? 'font-semibold' : ''}"
							>
								<Check class="size-4 text-emerald-600" />{workspace.t(`ui.ws.module.${module}`)}
							</li>{/each}
					</ul>
					{#if !current || tenant.billingCycle !== model.cycle}<Button
							class="w-full"
							variant={current ? 'outline' : 'default'}
							disabled={model.busy}
							onclick={() => model.choosePlan(plan.code)}
							>{current ? workspace.t('ui.ws.billing.switch_cycle') : workspace.t('ui.ws.billing.choose')}</Button
						>{/if}
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header
				><Card.Title>{workspace.t('ui.ws.billing.modules')}</Card.Title><Card.Description
					>{workspace.t('ui.ws.billing.modules_text')}</Card.Description
				></Card.Header
			>
			<Card.Content>
				<ul class="space-y-2">
					{#each moduleKeys.filter((module) => !coreModules.includes(module)) as module (module)}
						{@const included = planIncludes(tenant.plan, module)}
						<li
							class="flex items-center justify-between gap-3 text-sm {module === highlight
								? 'bg-sky-500/10 -mx-2 rounded-md px-2 py-1'
								: ''}"
						>
							<label for="mod-{module}" class="flex-1"
								>{workspace.t(`ui.ws.module.${module}`)}{#if !included}<span class="text-muted-foreground block text-xs"
										>{workspace.t('ui.ws.billing.not_in_plan')}</span
									>{/if}</label
							>
							<Switch
								id="mod-{module}"
								checked={tenant.enabledModules.includes(module) && included}
								disabled={!included || model.busy}
								onCheckedChange={(checked) => model.toggleModule(module, checked)}
							/>
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
		<div class="space-y-6">
			<Card.Root>
				<Card.Header><Card.Title>{workspace.t('ui.ws.billing.payment_method')}</Card.Title></Card.Header>
				<Card.Content class="flex items-center gap-3">
					<CreditCard class="text-muted-foreground size-5" />
					<p class="flex-1 text-sm">
						{tenant.paymentMethod
							? workspace.t('ui.ws.billing.card', {
									brand: tenant.paymentMethod.brand,
									last: tenant.paymentMethod.last4,
									expires: tenant.paymentMethod.expires,
								})
							: workspace.t('ui.ws.billing.no_card')}
					</p>
					<Button variant="outline" size="sm" onclick={() => (cardOpen = true)}
						>{tenant.paymentMethod ? workspace.t('ui.ws.edit') : workspace.t('ui.ws.billing.add_card')}</Button
					>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Header><Card.Title>{workspace.t('ui.ws.billing.history')}</Card.Title></Card.Header>
				<Card.Content>
					<ul class="divide-y text-sm">
						{#each model.history.data ?? [] as invoice (invoice.number)}
							<li class="flex items-center gap-3 py-2">
								<span class="flex-1">{invoice.number}</span><span class="text-muted-foreground"
									>{workspace.i18n.date(invoice.date)}</span
								><span class="tabular-nums">{workspace.i18n.money(invoice.amount)}</span><StatusBadge
									tone={invoice.status === 'paid' ? 'success' : 'info'}
									label={workspace.t(`ui.ws.invoice.status.${invoice.status}`)}
								/>
							</li>
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>
			<div class="flex justify-end">
				{#if tenant.cancelledAt}<Button onclick={() => model.resume()}>{workspace.t('ui.ws.billing.resume')}</Button
					>{:else}<Button variant="ghost" class="text-destructive" onclick={askCancel}
						>{workspace.t('ui.ws.billing.cancel')}</Button
					>{/if}
			</div>
		</div>
	</div>
</ModuleGate>

<Dialog.Root bind:open={cardOpen}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-sm">
		<Dialog.Header
			><Dialog.Title>{workspace.t('ui.ws.billing.payment_method')}</Dialog.Title><Dialog.Description
				>{workspace.t('ui.ws.billing.card_hint')}</Dialog.Description
			></Dialog.Header
		>
		<form id="card-form" class="space-y-3" onsubmit={saveCard} novalidate>
			<FormField id="card-number" label={workspace.t('ui.ws.billing.card_number')} error={model.fields.number}
				><Input
					id="card-number"
					inputmode="numeric"
					autocomplete="off"
					bind:value={model.cardNumber}
					placeholder="4242 4242 4242 4242"
				/></FormField
			>
			<FormField id="card-expires" label={workspace.t('ui.ws.billing.card_expires')} error={model.fields.expires}
				><Input id="card-expires" autocomplete="off" bind:value={model.cardExpires} placeholder="08/28" /></FormField
			>
		</form>
		<Dialog.Footer
			><Button variant="outline" onclick={() => (cardOpen = false)}>{workspace.t('ui.ws.cancel')}</Button><Button
				type="submit"
				form="card-form"
				disabled={model.busy}>{workspace.t('ui.save')}</Button
			></Dialog.Footer
		>
	</Dialog.Content>
</Dialog.Root>
<ConfirmDialog bind:request={confirm} />
