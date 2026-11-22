<script lang="ts">
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import Eye from '@lucide/svelte/icons/eye';
	import Send from '@lucide/svelte/icons/send';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import CalendarCheck from '@lucide/svelte/icons/calendar-check';
	import * as DropdownMenu from '@clinks/ui-shared/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Textarea } from '@clinks/ui-shared/components/ui/textarea';
	import SettingsCard from '$lib/components/kit/SettingsCard.svelte';
	import InvoiceDocument from './InvoiceDocument.svelte';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import FormField from '$lib/components/common/FormField.svelte';
	import Choice from '$lib/components/common/Choice.svelte';
	import ContactPicker from '$lib/components/common/ContactPicker.svelte';
	import UnsavedChangesGuard from '$lib/components/common/UnsavedChangesGuard.svelte';
	import ModuleGate from '$lib/components/shell/ModuleGate.svelte';
	import { InvoiceEditorModel, physioTariffLines } from '$lib/features/finance/invoice-editor.svelte';
	import { lineNet } from '$lib/domain/money';
	import { vatRates, physioServices } from '$lib/domain/types';
	import type { AppointmentId, ContactId, InvoiceId } from '$lib/domain/ids';
	import { href, navigate } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	let {
		id = null,
		contactId = null,
		appointmentId = null,
	}: { id?: InvoiceId | null; contactId?: ContactId | null; appointmentId?: AppointmentId | null } = $props();
	const workspace = useWorkspace();
	// svelte-ignore state_referenced_locally
	const model = new InvoiceEditorModel(workspace, id, { contactId, appointmentId });
	const vatOptions = $derived(vatRates.map((rate) => ({ value: String(rate), label: workspace.i18n.percent(rate) })));
	onMount(() => model.resource.connect());

	async function save(issue: boolean) {
		const saved = await model.save(issue);
		if (saved) await navigate(`/finance/invoices/${saved.id}`);
	}
</script>

<UnsavedChangesGuard dirty={model.dirty && !model.busy} />

<ModuleGate module="finance" permission="finance.write">
	<AsyncView resource={model.resource} skeleton="detail">
		{#snippet children(data)}
			{@const contact = data.contacts.find((row) => row.id === model.contactId) ?? null}
			<a
				class="text-muted-foreground hover:text-foreground inline-flex h-7 items-center gap-1 pr-2 text-[13px]"
				href={href('/finance/invoices')}
			>
				<ChevronLeft class="size-4" />{workspace.t('ui.ws.command.group_invoices')}
			</a>
			<header class="mt-2 mb-5 flex flex-wrap items-center gap-3">
				<h1 class="font-mono text-lg font-semibold">
					{data.invoice?.number ?? workspace.t('ui.ws.invoice.new_draft')}
				</h1>
				<span class="bg-muted text-muted-foreground inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs">
					<span class="bg-muted-foreground size-1.5 rounded-full"></span>{workspace.t('ui.ws.invoice.status.draft')}
				</span>
				<div class="ml-auto flex flex-wrap gap-2">
					<Button variant="outline" size="sm" onclick={() => window.print()}>
						<Eye class="size-4" />{workspace.t('ui.ws.invoice.pdf_preview')}
					</Button>
					<Button variant="outline" size="sm" disabled={model.busy} onclick={() => save(false)}>
						{workspace.t('ui.ws.invoice.save_draft')}
					</Button>
					<Button size="sm" disabled={model.busy || !model.contactId} onclick={() => save(true)}>
						<Send class="size-4" />{workspace.t('ui.ws.invoice.issue')}
					</Button>
				</div>
			</header>
			<div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
				<div class="min-w-0 overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]">
					{#if workspace.session.tenant}
						<InvoiceDocument
							invoice={model.preview(workspace.t('ui.ws.invoice.draft_number'))}
							{contact}
							tenant={workspace.session.tenant}
						/>
					{/if}
				</div>
				<div class="grid gap-4">
					<SettingsCard card={{ title: workspace.t('ui.ws.invoice.edit_panel') }}>
						<div class="grid gap-3">
							<FormField id="inv-contact" label={workspace.t('ui.ws.finance.recipient')} error={model.fields.contactId}>
								<ContactPicker
									id="inv-contact"
									bind:value={model.contactId}
									contacts={data.contacts}
									allowEmpty={false}
									invalid={!!model.fields.contactId}
								/>
							</FormField>
							<div class="grid grid-cols-2 gap-3">
								<FormField id="inv-date" label={workspace.t('ui.ws.finance.issue_date')}>
									<Input id="inv-date" type="date" bind:value={model.issueDate} />
								</FormField>
								<FormField id="inv-days" label={workspace.t('ui.ws.finance.payment_days')}>
									<Input id="inv-days" type="number" min="0" bind:value={model.paymentDays} />
								</FormField>
							</div>
						</div>
					</SettingsCard>

					<SettingsCard card={{ title: workspace.t('ui.ws.finance.lines') }}>
						{#snippet actions()}
							<span class="text-muted-foreground text-sm tabular-nums">{workspace.i18n.money(model.totals.gross)}</span>
						{/snippet}
						{#if model.fields.lines}<p class="text-destructive mb-2 text-xs">{model.fields.lines}</p>{/if}
						<div class="grid gap-2">
							{#each model.lines as line, index (index)}
								<div class="bg-sunken reveal-scope grid gap-2 rounded-lg border p-2.5">
									<Input
										bind:value={line.description}
										placeholder={workspace.t('ui.ws.planner.description')}
										aria-label={workspace.t('ui.ws.planner.description')}
										aria-invalid={!!model.fields[`lines.${index}.description`]}
										class="bg-field"
									/>
									<div class="grid grid-cols-[4.5rem_minmax(0,1fr)_6rem] gap-2">
										<label class="grid gap-1">
											<span class="text-muted-foreground text-[11px]">
												{workspace.t('ui.ws.invoice.quantity')}
											</span><Input
												type="number"
												step="0.25"
												min="0"
												class="bg-field text-right"
												bind:value={line.quantity}
											/>
										</label>
										<label class="grid gap-1">
											<span class="text-muted-foreground text-[11px]">
												{workspace.t('ui.ws.finance.unit_price_chf')}
											</span><Input
												inputmode="decimal"
												class="bg-field text-right"
												value={(line.unitPrice / 100).toFixed(2)}
												onchange={(event) => model.setPrice(index, event.currentTarget.value)}
											/>
										</label>
										<label class="grid gap-1">
											<span class="text-muted-foreground text-[11px]">{workspace.t('ui.ws.invoice.vat')}</span><Choice
												value={String(line.vatRate)}
												options={vatOptions}
												onchange={(value) => model.setVat(index, value)}
												label={workspace.t('ui.ws.invoice.vat')}
											/>
										</label>
									</div>
									<div class="flex items-center justify-end gap-2 text-sm">
										<b class="tabular-nums">{workspace.i18n.money(lineNet(line))}</b>
										<Button
											variant="ghost"
											size="icon-xs"
											class="reveal"
											onclick={() => model.removeLine(index)}
											aria-label={workspace.t('ui.ws.delete')}
										>
											<X class="size-3.5" />
										</Button>
									</div>
								</div>
							{/each}
							<div class="flex gap-2">
								<Button variant="outline" size="sm" class="flex-1" onclick={() => model.addLine()}>
									<Plus class="size-4" />{workspace.t('ui.ws.finance.add_line')}
								</Button>
								{#if workspace.session.hasModule('physio')}
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}<Button {...props} variant="outline" size="sm">
													{workspace.t('ui.ws.finance.add_tariff')}
												</Button>{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											{#each physioServices as service (service)}<DropdownMenu.Item
													onclick={() => model.addLine(physioTariffLines[service])}
												>
													{physioTariffLines[service].description}
												</DropdownMenu.Item>{/each}
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								{/if}
							</div>
						</div>
						<dl class="mt-3 grid gap-1 border-t pt-3 text-sm tabular-nums">
							<div class="flex justify-between">
								<dt class="text-muted-foreground">{workspace.t('ui.ws.invoice.net')}</dt>
								<dd>{workspace.i18n.money(model.totals.net)}</dd>
							</div>
							{#each model.totals.shares.filter((share) => share.rate > 0) as share (share.rate)}<div
									class="text-muted-foreground flex justify-between"
								>
									<dt>{workspace.t('ui.ws.invoice.vat')} {workspace.i18n.percent(share.rate)}</dt>
									<dd>{workspace.i18n.money(share.vat)}</dd>
								</div>{/each}
							<div class="flex justify-between font-semibold">
								<dt>{workspace.t('ui.ws.finance.gross')}</dt>
								<dd>{workspace.i18n.money(model.totals.gross)}</dd>
							</div>
						</dl>
					</SettingsCard>

					{#if model.contactId && model.unbilled.length > 0}
						<SettingsCard
							card={{
								title: workspace.t('ui.ws.finance.unbilled'),
								description: workspace.t('ui.ws.finance.unbilled_text'),
							}}
						>
							<ul class="grid gap-1 text-sm">
								{#each model.unbilled as appointment (appointment.id)}
									<li class="flex items-center gap-2">
										<CalendarCheck class="text-muted-foreground size-4" />
										<span class="flex-1">{workspace.i18n.dateTime(appointment.start)}</span>
										<Button
											variant="outline"
											size="xs"
											disabled={model.appointmentIds.includes(appointment.id)}
											onclick={() => model.addAppointment(appointment)}
										>
											{model.appointmentIds.includes(appointment.id)
												? workspace.t('ui.ws.finance.added')
												: workspace.t('ui.ws.finance.add')}
										</Button>
									</li>
								{/each}
							</ul>
						</SettingsCard>
					{/if}

					<SettingsCard card={{ title: workspace.t('ui.ws.finance.notes') }}>
						<Textarea id="inv-notes" rows={3} class="bg-field" bind:value={model.notes} />
					</SettingsCard>
				</div>
			</div>
		{/snippet}
	</AsyncView>
</ModuleGate>
