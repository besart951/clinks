<script lang="ts">
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import CalendarCheck from '@lucide/svelte/icons/calendar-check';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import * as DropdownMenu from '@clinks/ui-shared/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Textarea } from '@clinks/ui-shared/components/ui/textarea';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
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
	import { navigate } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	let { id = null, contactId = null, appointmentId = null }: { id?: InvoiceId | null; contactId?: ContactId | null; appointmentId?: AppointmentId | null } = $props();
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
			<PageHeader title={data.invoice ? workspace.t('ui.ws.invoice.edit_title', { number: data.invoice.number }) : workspace.t('ui.ws.command.new_invoice')} crumbs={[{ label: workspace.t('ui.ws.module.finance'), path: '/finance' }, { label: data.invoice?.number ?? workspace.t('ui.ws.command.new_invoice') }]}>
				{#snippet actions()}
					<Button variant="outline" disabled={model.busy} onclick={() => save(false)}>{workspace.t('ui.ws.invoice.save_draft')}</Button>
					<Button disabled={model.busy} onclick={() => save(true)}>{workspace.t('ui.ws.invoice.issue')}</Button>
				{/snippet}
			</PageHeader>
			<div class="grid gap-6 xl:grid-cols-[1fr_20rem]">
				<Card.Root>
					<Card.Content class="space-y-6">
						<div class="grid gap-4 sm:grid-cols-[1fr_10rem_8rem]">
							<FormField id="inv-contact" label={workspace.t('ui.ws.finance.recipient')} error={model.fields.contactId}>
								<ContactPicker id="inv-contact" bind:value={model.contactId} contacts={data.contacts} allowEmpty={false} invalid={!!model.fields.contactId} />
							</FormField>
							<FormField id="inv-date" label={workspace.t('ui.ws.finance.issue_date')}><Input id="inv-date" type="date" bind:value={model.issueDate} /></FormField>
							<FormField id="inv-days" label={workspace.t('ui.ws.finance.payment_days')}><Input id="inv-days" type="number" min="0" bind:value={model.paymentDays} /></FormField>
						</div>

						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<h2 class="text-sm font-semibold">{workspace.t('ui.ws.finance.lines')}</h2>
								{#if workspace.session.hasModule('physio')}
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} variant="outline" size="sm">{workspace.t('ui.ws.finance.add_tariff')}</Button>{/snippet}</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">{#each physioServices as service (service)}<DropdownMenu.Item onclick={() => model.addLine(physioTariffLines[service])}>{physioTariffLines[service].description}</DropdownMenu.Item>{/each}</DropdownMenu.Content>
									</DropdownMenu.Root>
								{/if}
							</div>
							{#if model.fields.lines}<p class="text-destructive text-xs">{model.fields.lines}</p>{/if}
							<div class="overflow-x-auto">
								<table class="w-full min-w-[640px] text-sm">
									<thead><tr class="text-muted-foreground text-left text-xs"><th class="py-1 font-medium">{workspace.t('ui.ws.planner.description')}</th><th class="w-20 py-1 font-medium">{workspace.t('ui.ws.invoice.quantity')}</th><th class="w-28 py-1 font-medium">{workspace.t('ui.ws.finance.unit_price_chf')}</th><th class="w-28 py-1 font-medium">{workspace.t('ui.ws.invoice.vat')}</th><th class="w-28 py-1 text-right font-medium">{workspace.t('ui.ws.invoice.amount')}</th><th class="w-8"></th></tr></thead>
									<tbody>
										{#each model.lines as line, index (index)}
											<tr>
												<td class="py-1 pr-2"><Input bind:value={line.description} aria-label={workspace.t('ui.ws.planner.description')} aria-invalid={!!model.fields[`lines.${index}.description`]} /></td>
												<td class="py-1 pr-2"><Input type="number" step="0.25" min="0" bind:value={line.quantity} aria-label={workspace.t('ui.ws.invoice.quantity')} /></td>
												<td class="py-1 pr-2"><Input inputmode="decimal" value={(line.unitPrice / 100).toFixed(2)} onchange={(event) => model.setPrice(index, event.currentTarget.value)} aria-label={workspace.t('ui.ws.finance.unit_price_chf')} /></td>
												<td class="py-1 pr-2"><Choice value={String(line.vatRate)} options={vatOptions} onchange={(value) => model.setVat(index, value)} label={workspace.t('ui.ws.invoice.vat')} /></td>
												<td class="py-1 text-right tabular-nums">{workspace.i18n.money(lineNet(line))}</td>
												<td class="py-1 pl-1"><Button variant="ghost" size="icon-xs" onclick={() => model.removeLine(index)} aria-label={workspace.t('ui.ws.delete')}><Trash2 class="size-3.5" /></Button></td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							<Button variant="ghost" size="sm" onclick={() => model.addLine()}><Plus class="size-4" />{workspace.t('ui.ws.finance.add_line')}</Button>
						</div>
						<FormField id="inv-notes" label={workspace.t('ui.ws.finance.notes')}><Textarea id="inv-notes" rows={3} bind:value={model.notes} /></FormField>
					</Card.Content>
				</Card.Root>
				<div class="space-y-6">
					<Card.Root>
						<Card.Header><Card.Title>{workspace.t('ui.ws.invoice.total')}</Card.Title></Card.Header>
						<Card.Content>
							<dl class="space-y-1 text-sm tabular-nums">
								<div class="flex justify-between"><dt>{workspace.t('ui.ws.invoice.net')}</dt><dd>{workspace.i18n.money(model.totals.net)}</dd></div>
								{#each model.totals.shares.filter((share) => share.rate > 0) as share (share.rate)}<div class="text-muted-foreground flex justify-between"><dt>{workspace.t('ui.ws.invoice.vat')} {workspace.i18n.percent(share.rate)}</dt><dd>{workspace.i18n.money(share.vat)}</dd></div>{/each}
								<div class="flex justify-between border-t pt-1 text-base font-semibold"><dt>{workspace.t('ui.ws.finance.gross')}</dt><dd>{workspace.i18n.money(model.totals.gross)}</dd></div>
							</dl>
							<p class="text-muted-foreground mt-2 text-xs">{workspace.t('ui.ws.finance.rounding_hint')}</p>
						</Card.Content>
					</Card.Root>
					{#if model.contactId && model.unbilled.length > 0}
						<Card.Root>
							<Card.Header><Card.Title>{workspace.t('ui.ws.finance.unbilled')}</Card.Title><Card.Description>{workspace.t('ui.ws.finance.unbilled_text')}</Card.Description></Card.Header>
							<Card.Content>
								<ul class="space-y-1 text-sm">
									{#each model.unbilled as appointment (appointment.id)}
										<li class="flex items-center gap-2">
											<CalendarCheck class="text-muted-foreground size-4" />
											<span class="flex-1">{workspace.i18n.dateTime(appointment.start)}</span>
											<Button variant="outline" size="xs" disabled={model.appointmentIds.includes(appointment.id)} onclick={() => model.addAppointment(appointment)}>{model.appointmentIds.includes(appointment.id) ? workspace.t('ui.ws.finance.added') : workspace.t('ui.ws.finance.add')}</Button>
										</li>
									{/each}
								</ul>
							</Card.Content>
						</Card.Root>
					{/if}
				</div>
			</div>
		{/snippet}
	</AsyncView>
</ModuleGate>
