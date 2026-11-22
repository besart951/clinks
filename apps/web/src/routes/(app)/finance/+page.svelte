<script lang="ts">
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import * as Card from '@clinks/ui/components/ui/card';
	import * as Table from '@clinks/ui/components/ui/table';
	import { Button } from '@clinks/ui/components/ui/button';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import SearchInput from '#lib/components/common/SearchInput.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import StatusBadge from '#lib/components/common/StatusBadge.svelte';
	import { invoiceTone } from '#lib/components/common/tones';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import FinanceNav from '#lib/components/finance/FinanceNav.svelte';
	import { InvoiceListModel } from '#lib/features/finance/invoice-detail.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { invoiceStatuses } from '@clinks/domain/types';
	import { href, navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new InvoiceListModel(workspace);
	const canWrite = $derived(workspace.session.can('finance.write'));
	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && void navigate('/finance/invoices/new'));
		return () => {
			stop();
			stopShortcut();
		};
	});
</script>

<svelte:head><title>{workspace.t('ui.ws.module.finance')} · CLinks</title></svelte:head>

<ModuleGate module="finance" permission="finance.read">
	<PageHeader title={workspace.t('ui.ws.module.finance')}>
		{#snippet actions()}{#if canWrite}<Button href={href('/finance/invoices/new')} aria-keyshortcuts="N">
					<Plus class="size-4" />{workspace.t('ui.ws.command.new_invoice')}
				</Button>{/if}{/snippet}
	</PageHeader>
	<FinanceNav />
	<AsyncView resource={model.resource}>
		{@const summary = model.summary}
		<div class="mb-4 grid gap-4 sm:grid-cols-3">
			<Card.Root>
				<Card.Content>
					<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.finance.open_receivables')}</p>
					<p class="text-2xl font-semibold tabular-nums">{workspace.i18n.money(summary.open)}</p>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content>
					<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.finance.overdue')}</p>
					<p class="text-destructive text-2xl font-semibold tabular-nums">
						{workspace.i18n.money(summary.overdue)}
					</p>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content>
					<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.finance.drafts')}</p>
					<p class="text-2xl font-semibold">{summary.drafts}</p>
				</Card.Content>
			</Card.Root>
		</div>
		<div class="mb-4 flex flex-wrap gap-2">
			<SearchInput bind:value={model.search} label={workspace.t('ui.ws.finance.search')} class="w-full sm:w-72" />
			<Choice
				bind:value={model.status}
				class="w-44"
				label={workspace.t('ui.ws.status')}
				options={[
					{ value: '', label: workspace.t('ui.ws.finance.all_statuses') },
					...invoiceStatuses.map((status) => ({
						value: status,
						label: workspace.t(`ui.ws.invoice.status.${status}`),
					})),
				]}
			/>
		</div>
		{#if model.rows.length === 0}
			<EmptyState icon={ReceiptText} title={workspace.t('ui.ws.finance.no_invoices')} />
		{:else}
			<div class="rounded-xl border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{workspace.t('ui.ws.finance.number')}</Table.Head>
							<Table.Head>{workspace.t('ui.ws.calendar.contact')}</Table.Head>
							<Table.Head class="hidden md:table-cell">{workspace.t('ui.ws.finance.issue_date')}</Table.Head>
							<Table.Head class="hidden md:table-cell">{workspace.t('ui.ws.finance.due_date')}</Table.Head>
							<Table.Head class="text-right">{workspace.t('ui.ws.invoice.amount')}</Table.Head>
							<Table.Head class="hidden text-right lg:table-cell">{workspace.t('ui.ws.finance.balance')}</Table.Head>
							<Table.Head>{workspace.t('ui.ws.status')}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each model.rows as row (row.invoice.id)}
							<Table.Row class="cursor-pointer" onclick={() => navigate(`/finance/invoices/${row.invoice.id}`)}>
								<Table.Cell>
									<a
										class="font-medium hover:underline"
										href={href(`/finance/invoices/${row.invoice.id}`)}
										onclick={(event) => event.stopPropagation()}
									>
										{row.invoice.number}
									</a>
								</Table.Cell>
								<Table.Cell class="max-w-48 truncate">{row.contact ? contactName(row.contact) : '—'}</Table.Cell>
								<Table.Cell class="hidden md:table-cell">{workspace.i18n.date(row.invoice.issueDate)}</Table.Cell>
								<Table.Cell class="hidden md:table-cell">{workspace.i18n.date(row.invoice.dueDate)}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{workspace.i18n.money(row.totals.gross)}</Table.Cell>
								<Table.Cell class="hidden text-right tabular-nums lg:table-cell">
									{row.totals.balance > 0 && row.status !== 'draft' && row.status !== 'cancelled'
										? workspace.i18n.money(row.totals.balance)
										: '—'}
								</Table.Cell>
								<Table.Cell>
									<StatusBadge
										tone={invoiceTone[row.status]}
										label={workspace.t(`ui.ws.invoice.status.${row.status}`)}
									/>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	</AsyncView>
</ModuleGate>
