<script lang="ts">
	import { onMount } from 'svelte';
	import Upload from '@lucide/svelte/icons/upload';
	import Landmark from '@lucide/svelte/icons/landmark';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import * as Card from '@clinks/ui/components/ui/card';
	import * as Table from '@clinks/ui/components/ui/table';
	import { Button } from '@clinks/ui/components/ui/button';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import FinanceNav from '#lib/components/finance/FinanceNav.svelte';
	import { PaymentsModel } from '#lib/features/finance/payments.svelte';
	import type { BankEntryView } from '@clinks/contracts/finance';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new PaymentsModel(workspace);
	const canWrite = $derived(workspace.session.can('finance.write'));
	let input = $state<HTMLInputElement>();
	onMount(() => model.resource.connect());

	function details(entry: BankEntryView) {
		const reference = entry.reference ? workspace.t('ui.ws.payments.reference', { reference: entry.reference }) : '';
		return [workspace.i18n.date(entry.date), reference, entry.info].filter(Boolean).join(' · ');
	}

	async function chosen(event: Event & { currentTarget: HTMLInputElement }) {
		await model.upload(event.currentTarget.files?.[0]);
		event.currentTarget.value = '';
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.payments.title')} · CLinks</title></svelte:head>

<ModuleGate module="finance" permission="finance.read">
	<PageHeader title={workspace.t('ui.ws.module.finance')} />
	<FinanceNav />
	<AsyncView resource={model.resource}>
		{#snippet children({ imports, entries, invoices })}
			<div class="grid gap-6 xl:grid-cols-[1fr_24rem]">
				<div class="space-y-6">
					{#if canWrite}
						<Card.Root>
							<Card.Header>
								<Card.Title><h2>{workspace.t('ui.ws.payments.import')}</h2></Card.Title>
								<Card.Description>{workspace.t('ui.ws.payments.import_text')}</Card.Description>
							</Card.Header>
							<Card.Content class="space-y-3">
								<input
									bind:this={input}
									id="bank-file"
									type="file"
									accept=".xml,application/xml,text/xml"
									class="sr-only"
									aria-label={workspace.t('ui.ws.payments.choose_file')}
									onchange={chosen}
								/>
								<Button onclick={() => input?.click()} disabled={model.busy}>
									<Upload class="size-4" />{workspace.t('ui.ws.payments.choose_file')}
								</Button>
								<div role="status" aria-live="polite">
									{#if model.result}
										<p class="flex items-start gap-2 text-sm">
											<CircleCheck class="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
											<span>
												{model.result.repeated
													? workspace.t('ui.ws.payments.repeated', { file: model.result.fileName })
													: workspace.t('ui.ws.payments.result', {
															file: model.result.fileName,
															credits: model.result.credits,
															booked: model.result.booked,
															duplicates: model.result.duplicates,
														})}
											</span>
										</p>
									{/if}
								</div>
							</Card.Content>
						</Card.Root>
					{/if}
					<Card.Root>
						<Card.Header>
							<Card.Title><h2>{workspace.t('ui.ws.payments.open')}</h2></Card.Title>
							<Card.Description>{workspace.t('ui.ws.payments.open_text')}</Card.Description>
						</Card.Header>
						<Card.Content>
							{#if entries.length === 0}
								<EmptyState icon={Landmark} title={workspace.t('ui.ws.payments.none_open')} />
							{:else}
								<ul class="divide-y" aria-label={workspace.t('ui.ws.payments.open')}>
									{#each entries as entry (entry.id)}
										<li class="space-y-3 py-4 first:pt-0 last:pb-0">
											<div class="flex flex-wrap items-baseline justify-between gap-2">
												<p class="font-medium break-words">
													{entry.debtor || workspace.t('ui.ws.payments.unknown_payer')}
												</p>
												<p class="font-semibold tabular-nums">
													{entry.currency === 'CHF'
														? workspace.i18n.money(entry.amount)
														: `${entry.currency} ${(entry.amount / 100).toFixed(2)}`}
												</p>
											</div>
											<p class="text-muted-foreground text-sm break-words">{details(entry)}</p>
											{#if canWrite}
												{#if entry.suggestions.length > 0}
													<div class="flex flex-wrap gap-2">
														{#each entry.suggestions as suggestion (suggestion.invoiceId)}
															<Button
																size="sm"
																variant="outline"
																onclick={() => model.assign(entry, suggestion.invoiceId)}
															>
																{workspace.t('ui.ws.payments.book_to', {
																	number: suggestion.number,
																	recipient: suggestion.recipient,
																	balance: workspace.i18n.money(suggestion.balance),
																})}
															</Button>
														{/each}
													</div>
												{/if}
												<div class="flex flex-wrap items-center gap-2">
													<Choice
														class="w-full sm:w-80"
														size="sm"
														label={workspace.t('ui.ws.payments.other_invoice')}
														placeholder={workspace.t('ui.ws.payments.other_invoice')}
														options={invoices.map((invoice) => ({ value: invoice.id, label: invoice.label }))}
														onchange={(value) => value && model.assign(entry, value)}
													/>
													<Button size="sm" variant="ghost" onclick={() => model.ignore(entry)}>
														{workspace.t('ui.ws.payments.ignore')}
													</Button>
												</div>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</Card.Content>
					</Card.Root>
				</div>
				<Card.Root class="self-start">
					<Card.Header><Card.Title><h2>{workspace.t('ui.ws.payments.history')}</h2></Card.Title></Card.Header>
					<Card.Content>
						{#if imports.length === 0}
							<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.payments.no_imports')}</p>
						{:else}
							<Table.Root>
								<Table.Header>
									<Table.Row>
										<Table.Head>{workspace.t('ui.ws.payments.file')}</Table.Head>
										<Table.Head class="text-right">{workspace.t('ui.ws.payments.booked')}</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each imports as item (item.id)}
										<Table.Row>
											<Table.Cell class="max-w-48">
												<span class="block truncate" title={item.fileName}>{item.fileName}</span>
												<span class="text-muted-foreground block text-xs">
													{workspace.i18n.date(item.importedAt)} · {item.kind} · {item.importedBy}
												</span>
											</Table.Cell>
											<Table.Cell class="text-right tabular-nums">{item.booked}/{item.credits}</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
							<a class="text-primary mt-3 inline-block text-sm hover:underline" href={href('/documents')}>
								{workspace.t('ui.ws.payments.files_in_documents')}
							</a>
						{/if}
					</Card.Content>
				</Card.Root>
			</div>
		{/snippet}
	</AsyncView>
</ModuleGate>
