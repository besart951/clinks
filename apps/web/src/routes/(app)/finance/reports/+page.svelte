<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '@clinks/ui/components/ui/card';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import FinanceNav from '#lib/components/finance/FinanceNav.svelte';
	import { ReportsModel } from '#lib/features/finance/reports.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new ReportsModel(workspace);
	onMount(() => model.resource.connect());
	const chartHeight = 180;

	function monthLabel(month: string) {
		return workspace.i18n.format(`${month}-01`, { month: 'short' });
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.finance.reports')} · CLinks</title></svelte:head>

<ModuleGate module="finance" permission="finance.read">
	<PageHeader title={workspace.t('ui.ws.module.finance')} />
	<FinanceNav />
	<AsyncView resource={model.resource} skeleton="cards">
		{#snippet children(report)}
			{@const max = Math.max(...report.months.flatMap((month) => [month.revenue, month.expenses]), 1)}
			<div class="mb-6 grid gap-4 sm:grid-cols-3">
				<Card.Root>
					<Card.Content>
						<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.report.revenue_year')}</p>
						<p class="text-2xl font-semibold tabular-nums">{workspace.i18n.money(report.yearRevenue)}</p>
					</Card.Content>
				</Card.Root>
				<Card.Root>
					<Card.Content>
						<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.report.expenses_year')}</p>
						<p class="text-2xl font-semibold tabular-nums">{workspace.i18n.money(report.yearExpenses)}</p>
					</Card.Content>
				</Card.Root>
				<Card.Root>
					<Card.Content>
						<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.report.result_year')}</p>
						<p
							class="text-2xl font-semibold tabular-nums {report.yearRevenue - report.yearExpenses < 0
								? 'text-destructive'
								: 'text-emerald-600'}"
						>
							{workspace.i18n.money(report.yearRevenue - report.yearExpenses)}
						</p>
					</Card.Content>
				</Card.Root>
			</div>
			<div class="grid gap-6 lg:grid-cols-3">
				<Card.Root class="lg:col-span-2">
					<Card.Header>
						<Card.Title>{workspace.t('ui.ws.report.monthly')}</Card.Title>
						<Card.Description class="flex gap-4">
							<span class="flex items-center gap-1.5">
								<span class="size-2.5 rounded-sm bg-teal-600"></span>{workspace.t('ui.ws.report.payments_received')}
							</span><span class="flex items-center gap-1.5">
								<span class="size-2.5 rounded-sm bg-zinc-400"></span>{workspace.t('ui.ws.finance.expenses')}
							</span>
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<svg
							viewBox="0 0 720 {chartHeight + 24}"
							class="w-full"
							role="img"
							aria-label={workspace.t('ui.ws.report.monthly')}
						>
							{#each [0.25, 0.5, 0.75, 1] as step (step)}
								<line
									x1="0"
									x2="720"
									y1={chartHeight - step * chartHeight}
									y2={chartHeight - step * chartHeight}
									stroke="var(--border)"
								/>
							{/each}
							{#each report.months as month, index (month.month)}
								{@const x = index * 60 + 10}
								<rect
									{x}
									y={chartHeight - (month.revenue / max) * chartHeight}
									width="18"
									height={(month.revenue / max) * chartHeight}
									rx="2"
									class="fill-teal-600"
								>
									<title>{monthLabel(month.month)}: {workspace.i18n.money(month.revenue)}</title>
								</rect>
								<rect
									x={x + 21}
									y={chartHeight - (month.expenses / max) * chartHeight}
									width="18"
									height={(month.expenses / max) * chartHeight}
									rx="2"
									class="fill-zinc-400"
								>
									<title>{monthLabel(month.month)}: {workspace.i18n.money(month.expenses)}</title>
								</rect>
								<text x={x + 20} y={chartHeight + 16} text-anchor="middle" class="fill-muted-foreground text-[11px]">
									{monthLabel(month.month)}
								</text>
							{/each}
						</svg>
						<table class="sr-only">
							<caption>{workspace.t('ui.ws.report.monthly')}</caption>
							<thead>
								<tr>
									<th>{workspace.t('ui.ws.calendar.view_month')}</th><th>
										{workspace.t('ui.ws.report.payments_received')}
									</th><th>{workspace.t('ui.ws.finance.expenses')}</th>
								</tr>
							</thead>
							<tbody>
								{#each report.months as month (month.month)}<tr>
										<td>{month.month}</td><td>{workspace.i18n.money(month.revenue)}</td><td>
											{workspace.i18n.money(month.expenses)}
										</td>
									</tr>{/each}
							</tbody>
						</table>
					</Card.Content>
				</Card.Root>
				<Card.Root>
					<Card.Header><Card.Title>{workspace.t('ui.ws.report.aging')}</Card.Title></Card.Header>
					<Card.Content>
						<dl class="space-y-2 text-sm">
							{#each report.aging as bucket (bucket.bucket)}
								<div class="flex justify-between gap-2">
									<dt>
										{workspace.t(`ui.ws.report.aging_${bucket.bucket}`)}
										<span class="text-muted-foreground">({bucket.count})</span>
									</dt>
									<dd class="tabular-nums {bucket.bucket !== 'current' && bucket.amount > 0 ? 'text-destructive' : ''}">
										{workspace.i18n.money(bucket.amount)}
									</dd>
								</div>
							{/each}
						</dl>
					</Card.Content>
				</Card.Root>
				<Card.Root>
					<Card.Header>
						<Card.Title>
							{workspace.t('ui.ws.report.vat', { quarter: report.quarter.label })}
						</Card.Title><Card.Description>{workspace.t('ui.ws.report.vat_text')}</Card.Description>
					</Card.Header>
					<Card.Content>
						<dl class="space-y-2 text-sm tabular-nums">
							{#each report.quarter.output as share (share.rate)}<div class="flex justify-between">
									<dt>{workspace.t('ui.ws.report.output_vat', { rate: workspace.i18n.percent(share.rate) })}</dt>
									<dd>{workspace.i18n.money(share.vat)}</dd>
								</div>{/each}
							<div class="flex justify-between">
								<dt>{workspace.t('ui.ws.expense.input_vat')}</dt>
								<dd>− {workspace.i18n.money(report.quarter.input)}</dd>
							</div>
							<div class="flex justify-between border-t pt-2 font-semibold">
								<dt>{workspace.t('ui.ws.report.vat_payable')}</dt>
								<dd>{workspace.i18n.money(report.quarter.payable)}</dd>
							</div>
						</dl>
					</Card.Content>
				</Card.Root>
				<Card.Root class="lg:col-span-2">
					<Card.Header><Card.Title>{workspace.t('ui.ws.report.categories')}</Card.Title></Card.Header>
					<Card.Content>
						{@const top = Math.max(...report.categories.map((entry) => entry.amount), 1)}
						<ul class="space-y-2 text-sm">
							{#each report.categories as entry (entry.category)}
								<li class="grid grid-cols-[8rem_1fr_6rem] items-center gap-3">
									<span>{workspace.t(`ui.ws.expense.category_${entry.category}`)}</span>
									<span class="bg-muted h-2 rounded-full">
										<span class="block h-2 rounded-full bg-zinc-500" style:width="{(entry.amount / top) * 100}%"></span>
									</span>
									<span class="text-right tabular-nums">{workspace.i18n.money(entry.amount)}</span>
								</li>
							{/each}
						</ul>
					</Card.Content>
				</Card.Root>
			</div>
		{/snippet}
	</AsyncView>
</ModuleGate>
