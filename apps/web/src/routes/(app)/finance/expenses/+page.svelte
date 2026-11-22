<script lang="ts">
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import * as Sheet from '@clinks/ui-shared/components/ui/sheet';
	import * as Table from '@clinks/ui-shared/components/ui/table';
	import * as DropdownMenu from '@clinks/ui-shared/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import FormField from '$lib/components/common/FormField.svelte';
	import Choice from '$lib/components/common/Choice.svelte';
	import StatusBadge from '$lib/components/common/StatusBadge.svelte';
	import ModuleGate from '$lib/components/shell/ModuleGate.svelte';
	import FinanceNav from '$lib/components/finance/FinanceNav.svelte';
	import { ExpensesModel } from '$lib/features/finance/expenses.svelte';
	import { vatFromGross } from '$lib/domain/money';
	import { expenseCategories, vatRates, type Expense } from '$lib/domain/types';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new ExpensesModel(workspace);
	const canWrite = $derived(workspace.session.can('finance.write'));
	let open = $state(false);
	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && edit(null));
		return () => {
			stop();
			stopShortcut();
		};
	});

	function edit(expense: Expense | null) {
		model.start(expense);
		open = true;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (await model.save()) open = false;
	}

	async function showReceipt(expense: Expense) {
		const url = await model.receiptUrl(expense);
		if (url) window.open(url, '_blank', 'noopener');
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.finance.expenses')} · CLinks</title></svelte:head>

<ModuleGate module="finance" permission="finance.read">
	<PageHeader title={workspace.t('ui.ws.module.finance')}>
		{#snippet actions()}{#if canWrite}<Button onclick={() => edit(null)} aria-keyshortcuts="N">
					<Plus class="size-4" />{workspace.t('ui.ws.expense.new')}
				</Button>{/if}{/snippet}
	</PageHeader>
	<FinanceNav />
	<div class="mb-4 flex flex-wrap items-center gap-2">
		<Choice
			bind:value={model.status}
			class="w-40"
			label={workspace.t('ui.ws.status')}
			options={[
				{ value: '', label: workspace.t('ui.ws.finance.all_statuses') },
				{ value: 'open', label: workspace.t('ui.ws.expense.status_open') },
				{ value: 'booked', label: workspace.t('ui.ws.expense.status_booked') },
			]}
		/>
		<Choice
			bind:value={model.category}
			class="w-48"
			label={workspace.t('ui.ws.expense.category')}
			options={[
				{ value: '', label: workspace.t('ui.ws.expense.all_categories') },
				...expenseCategories.map((category) => ({
					value: category,
					label: workspace.t(`ui.ws.expense.category_${category}`),
				})),
			]}
		/>
		<p class="ml-auto text-sm">{workspace.t('ui.ws.expense.total', { amount: workspace.i18n.money(model.total) })}</p>
	</div>
	<AsyncView resource={model.resource}>
		<div class="rounded-xl border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{workspace.t('ui.ws.calendar.date')}</Table.Head>
						<Table.Head>{workspace.t('ui.ws.planner.description')}</Table.Head>
						<Table.Head class="hidden md:table-cell">{workspace.t('ui.ws.expense.category')}</Table.Head>
						<Table.Head class="text-right">{workspace.t('ui.ws.invoice.amount')}</Table.Head>
						<Table.Head class="hidden text-right lg:table-cell">{workspace.t('ui.ws.expense.input_vat')}</Table.Head>
						<Table.Head>{workspace.t('ui.ws.status')}</Table.Head>
						<Table.Head class="w-10"><span class="sr-only">{workspace.t('ui.action')}</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each model.rows as expense (expense.id)}
						<Table.Row>
							<Table.Cell>{workspace.i18n.date(expense.date)}</Table.Cell>
							<Table.Cell>
								<p class="font-medium">{expense.description}</p>
								<p class="text-muted-foreground text-xs">{expense.supplier}</p>
							</Table.Cell>
							<Table.Cell class="hidden md:table-cell">
								{workspace.t(`ui.ws.expense.category_${expense.category}`)}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{workspace.i18n.money(expense.amount)}</Table.Cell>
							<Table.Cell class="text-muted-foreground hidden text-right tabular-nums lg:table-cell">
								{workspace.i18n.money(vatFromGross(expense.amount, expense.vatRate))}
							</Table.Cell>
							<Table.Cell>
								<div class="flex items-center gap-1">
									<StatusBadge
										tone={expense.status === 'booked' ? 'success' : 'warning'}
										label={workspace.t(`ui.ws.expense.status_${expense.status}`)}
									/>{#if expense.receiptId}<button
											onclick={() => showReceipt(expense)}
											aria-label={workspace.t('ui.ws.expense.show_receipt')}
										>
											<Paperclip class="text-muted-foreground size-3.5" />
										</button>{/if}
								</div>
							</Table.Cell>
							<Table.Cell>
								{#if canWrite}
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
											<DropdownMenu.Item onclick={() => edit(expense)}>{workspace.t('ui.ws.edit')}</DropdownMenu.Item>
											{#if expense.status === 'open'}<DropdownMenu.Item onclick={() => model.book(expense)}>
													{workspace.t('ui.ws.expense.book')}
												</DropdownMenu.Item>{/if}
											<DropdownMenu.Item variant="destructive" onclick={() => model.remove(expense)}>
												{workspace.t('ui.ws.delete')}
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</AsyncView>
</ModuleGate>

<Sheet.Root bind:open>
	<Sheet.Content closeLabel={workspace.t('ui.ws.close')} class="w-full overflow-y-auto sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title>{model.editing ? workspace.t('ui.ws.expense.edit') : workspace.t('ui.ws.expense.new')}</Sheet.Title>
		</Sheet.Header>
		<form id="expense-form" class="space-y-4 px-4" onsubmit={submit} novalidate>
			<div class="grid grid-cols-2 gap-3">
				<FormField id="e-date" label={workspace.t('ui.ws.calendar.date')} error={model.fields.date}>
					<Input id="e-date" type="date" bind:value={model.value.date} />
				</FormField>
				<FormField id="e-amount" label={workspace.t('ui.ws.expense.amount_gross')} error={model.fields.amount}>
					<Input
						id="e-amount"
						inputmode="decimal"
						bind:value={model.amountInput}
						aria-invalid={!!model.fields.amount}
					/>
				</FormField>
			</div>
			<FormField id="e-description" label={workspace.t('ui.ws.planner.description')} error={model.fields.description}>
				<Input id="e-description" bind:value={model.value.description} aria-invalid={!!model.fields.description} />
			</FormField>
			<FormField id="e-supplier" label={workspace.t('ui.ws.expense.supplier')}>
				<Input id="e-supplier" bind:value={model.value.supplier} />
			</FormField>
			<div class="grid grid-cols-2 gap-3">
				<FormField id="e-category" label={workspace.t('ui.ws.expense.category')}>
					<Choice
						id="e-category"
						bind:value={model.value.category}
						options={expenseCategories.map((category) => ({
							value: category,
							label: workspace.t(`ui.ws.expense.category_${category}`),
						}))}
					/>
				</FormField>
				<FormField id="e-vat" label={workspace.t('ui.ws.invoice.vat')}>
					<Choice
						id="e-vat"
						value={String(model.value.vatRate)}
						options={vatRates.map((rate) => ({ value: String(rate), label: workspace.i18n.percent(rate) }))}
						onchange={(value) => model.setVat(value)}
					/>
				</FormField>
			</div>
			<FormField
				id="e-receipt"
				label={workspace.t('ui.ws.expense.receipt')}
				hint={model.value.receiptId && !model.receipt
					? workspace.t('ui.ws.expense.receipt_present')
					: workspace.t('ui.ws.documents.drop_hint')}
			>
				<Input
					id="e-receipt"
					type="file"
					accept="image/*,application/pdf"
					onchange={(event) => (model.receipt = event.currentTarget.files?.[0] ?? null)}
				/>
			</FormField>
		</form>
		<Sheet.Footer class="flex-row justify-end">
			<Button variant="outline" onclick={() => (open = false)}>{workspace.t('ui.ws.cancel')}</Button><Button
				type="submit"
				form="expense-form"
				disabled={model.busy}
			>
				{workspace.t('ui.save')}
			</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
