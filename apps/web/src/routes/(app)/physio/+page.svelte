<script lang="ts">
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import * as Table from '@clinks/ui-shared/components/ui/table';
	import * as Tabs from '@clinks/ui-shared/components/ui/tabs';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import SearchInput from '$lib/components/common/SearchInput.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import StatusBadge from '$lib/components/common/StatusBadge.svelte';
	import ModuleGate from '$lib/components/shell/ModuleGate.svelte';
	import ContactFormSheet from '$lib/components/contacts/ContactFormSheet.svelte';
	import { PatientsModel, patientTag } from '$lib/features/physio/physio.svelte';
	import Initials from '$lib/components/kit/Initials.svelte';
	import ProgressRing from '$lib/components/kit/ProgressRing.svelte';
	import { contactName } from '$lib/data/workspace-api';
	import { href, navigate } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new PatientsModel(workspace);
	const canWrite = $derived(workspace.session.can('physio.write') && workspace.session.can('contacts.write'));
	let sheet: ContactFormSheet;
	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && sheet.show(null, { tags: [patientTag] }));
		return () => {
			stop();
			stopShortcut();
		};
	});
</script>

<svelte:head><title>{workspace.t('ui.ws.module.physio')} · CLinks</title></svelte:head>

<ModuleGate module="physio" permission="physio.read">
	<PageHeader title={workspace.t('ui.ws.physio.patients')} description={workspace.t('ui.ws.physio.patients_text')}>
		{#snippet actions()}
			<Button variant="outline" href={href('/calendar?view=resources')}>{workspace.t('ui.ws.physio.agenda')}</Button>
			{#if canWrite}<Button onclick={() => sheet.show(null, { tags: [patientTag] })} aria-keyshortcuts="N">
					<Plus class="size-4" />{workspace.t('ui.ws.physio.new_patient')}
				</Button>{/if}
		{/snippet}
	</PageHeader>
	<div class="mb-4 flex flex-wrap items-center gap-2">
		<SearchInput bind:value={model.search} label={workspace.t('ui.ws.physio.search')} class="w-full sm:w-72" />
		<Tabs.Root bind:value={model.filter}>
			<Tabs.List>
				<Tabs.Trigger value="all">{workspace.t('ui.ws.contacts.kind_all')}</Tabs.Trigger>
				<Tabs.Trigger value="alerts">{workspace.t('ui.ws.physio.with_alerts')}</Tabs.Trigger>
				<Tabs.Trigger value="week">{workspace.t('ui.ws.physio.this_week')}</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
	</div>
	<AsyncView resource={model.resource} isEmpty={() => model.rows.length === 0}>
		{#snippet empty()}<EmptyState icon={HeartPulse} title={workspace.t('ui.ws.physio.no_patients')} />{/snippet}
		<div class="rounded-xl border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{workspace.t('ui.ws.physio.patient')}</Table.Head>
						<Table.Head class="hidden md:table-cell">{workspace.t('ui.ws.field.insurer')}</Table.Head>
						<Table.Head>{workspace.t('ui.ws.physio.next_appointment')}</Table.Head>
						<Table.Head class="hidden lg:table-cell">{workspace.t('ui.ws.physio.prescription')}</Table.Head>
						<Table.Head class="hidden sm:table-cell">{workspace.t('ui.ws.physio.alerts')}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each model.rows as row (row.patient.id)}
						<Table.Row class="cursor-pointer" onclick={() => navigate(`/physio/${row.patient.id}`)}>
							<Table.Cell>
								<span class="flex items-center gap-2.5">
									<Initials name={contactName(row.patient)} /><span class="grid min-w-0">
										<a
											class="font-medium hover:underline"
											href={href(`/physio/${row.patient.id}`)}
											onclick={(event) => event.stopPropagation()}
										>
											{contactName(row.patient)}
										</a>{#if row.patient.birthDate}<span class="text-muted-foreground block text-xs">
												{workspace.i18n.date(row.patient.birthDate)}
											</span>{/if}
									</span>
								</span>
							</Table.Cell>
							<Table.Cell class="hidden md:table-cell">{row.patient.insurer || '—'}</Table.Cell>
							<Table.Cell>{row.next ? workspace.i18n.dateTime(row.next.start) : '—'}</Table.Cell>
							<Table.Cell class="hidden lg:table-cell">
								{#if row.progress}
									<div class="flex items-center gap-2">
										<ProgressRing
											value={row.progress.used}
											max={row.progress.prescription.sessionsPrescribed}
											size={30}
										/><span class="text-muted-foreground text-xs tabular-nums">
											{row.progress.used}/{row.progress.prescription.sessionsPrescribed}
										</span>
									</div>
								{:else}—{/if}
							</Table.Cell>
							<Table.Cell class="hidden sm:table-cell">
								{#if row.alert}<StatusBadge
										tone={row.alert === 'expiring' ? 'warning' : 'danger'}
										label={workspace.t(`ui.ws.physio.alert_${row.alert}`)}
									/>{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
		{@const alerts = (model.resource.data ?? []).filter((row) => row.alert && row.next).length}
		{#if alerts > 0}<p class="mt-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
				<TriangleAlert class="size-4" />{workspace.t('ui.ws.physio.alerts_hint', { count: alerts })}
			</p>{/if}
	</AsyncView>
</ModuleGate>

<ContactFormSheet bind:this={sheet} onSaved={(contact) => navigate(`/physio/${contact.id}`)} />
