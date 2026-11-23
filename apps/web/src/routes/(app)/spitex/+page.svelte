<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Wand from '@lucide/svelte/icons/wand-sparkles';
	import Printer from '@lucide/svelte/icons/printer';
	import Plus from '@lucide/svelte/icons/plus';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import * as Card from '@clinks/ui/components/ui/card';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui/components/ui/button';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import SpitexNav from '#lib/components/spitex/SpitexNav.svelte';
	import TimeGrid, { type GridColumn, type GridHandlers } from '#lib/components/calendar/TimeGrid.svelte';
	import AppointmentSheet from '#lib/components/calendar/AppointmentSheet.svelte';
	import { PlanningModel } from '#lib/features/spitex/planning.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { addDays, minutesToTime, today } from '@clinks/domain/dates';
	import { firstFreeStart } from '@clinks/domain/scheduling';
	import type { Appointment } from '@clinks/domain/types';
	import type { UserId } from '@clinks/domain/ids';
	import { routeQuery } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new PlanningModel(workspace);
	const people = new PeopleDirectory(workspace);
	const canWrite = $derived(workspace.session.can('spitex.write') && workspace.session.can('calendar.write'));
	const staff = $derived(people.people);
	let sheet: AppointmentSheet;
	const query = routeQuery(page.url);
	if (query.get('date')) model.date = query.get('date')!;

	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && createVisit());
		return () => {
			stop();
			stopShortcut();
		};
	});

	function createVisit() {
		sheet.show(null, {
			kind: 'spitex',
			date: model.date,
			assigneeId: null,
			startTime: '08:00',
			endTime: '08:30',
			windowFrom: '08:00',
			windowTo: '08:30',
		});
	}

	const handlers: GridHandlers = {
		open: (appointment) => sheet.show(appointment),
		create: () => canWrite && createVisit(),
		drop: (appointment, _date, minutes, assigneeId) =>
			model.assign(appointment, assigneeId ?? null, assigneeId === null ? null : minutes),
		resize: (appointment, times) => model.retime(appointment, times),
		color: (appointment) => people.get(appointment.assigneeId)?.avatarColor ?? '#a1a1aa',
		subtitle: (appointment) => (appointment.service ? workspace.t(`ui.ws.spitex.service.${appointment.service}`) : ''),
	};

	const columns = $derived<GridColumn[]>([
		{
			key: 'open',
			label: workspace.t('ui.ws.spitex.open_visits'),
			sublabel: workspace.t('ui.ws.spitex.count', { count: model.open.length }),
			date: model.date,
			assigneeId: null,
			appointments: model.open,
		},
		...staff.map((person) => ({
			key: person.id,
			label: person.name,
			sublabel: person.jobTitle,
			date: model.date,
			assigneeId: person.id,
			appointments: model.day.filter((row) => row.assigneeId === person.id),
		})),
	]);

	function assignTo(visit: Appointment, assigneeId: UserId) {
		const start = firstFreeStart(visit, model.date, assigneeId, model.day);
		if (!start) {
			void model.assign(visit, assigneeId, null);
			return;
		}
		const date = new Date(start);
		void model.assign(visit, assigneeId, date.getHours() * 60 + date.getMinutes());
	}

	function windowLabel(visit: Appointment) {
		return visit.arrivalWindow
			? `${visit.arrivalWindow.from}–${visit.arrivalWindow.to}`
			: workspace.i18n.time(visit.start);
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.spitex.planning')} · CLinks</title></svelte:head>

<ModuleGate module="spitex" permission="spitex.read">
	<PageHeader title={workspace.t('ui.ws.module.spitex')}>
		{#snippet actions()}
			<Button variant="outline" onclick={() => workspace.platform.files.print()}>
				<Printer class="size-4" />{workspace.t('ui.ws.spitex.print_plan')}
			</Button>
			{#if canWrite}
				<Button variant="outline" disabled={model.open.length === 0} onclick={() => model.autoAssign(staff)}>
					<Wand class="size-4" />{workspace.t('ui.ws.spitex.auto_assign')}
				</Button>
				<Button onclick={createVisit} aria-keyshortcuts="N">
					<Plus class="size-4" />{workspace.t('ui.ws.spitex.new_visit')}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>
	<SpitexNav />

	<div class="mb-4 flex flex-wrap items-center gap-2">
		<Button variant="outline" size="sm" onclick={() => model.setDate(today())}>
			{workspace.t('ui.ws.calendar.today')}
		</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			onclick={() => model.setDate(addDays(model.date, -1))}
			aria-label={workspace.t('ui.ws.calendar.previous')}
		>
			<ChevronLeft class="size-4" />
		</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			onclick={() => model.setDate(addDays(model.date, 1))}
			aria-label={workspace.t('ui.ws.calendar.next')}
		>
			<ChevronRight class="size-4" />
		</Button>
		<h2 class="font-semibold capitalize" aria-live="polite">
			{workspace.i18n.format(model.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
		</h2>
	</div>

	<AsyncView resource={model.resource} skeleton="detail">
		<div
			class="mb-4 grid grid-cols-7 gap-1 text-center text-xs"
			role="group"
			aria-label={workspace.t('ui.ws.calendar.view_week')}
		>
			{#each model.week as day (day)}
				{@const open = model.openOn(day)}
				<button
					class="rounded-lg border px-1 py-2 {day === model.date ? 'border-foreground bg-muted' : 'hover:bg-muted'}"
					onclick={() => model.setDate(day)}
					aria-pressed={day === model.date}
				>
					<span class="block font-medium">{workspace.i18n.format(day, { weekday: 'short', day: 'numeric' })}</span>
					{#if open > 0}<span class="text-amber-700 dark:text-amber-400">
							{workspace.t('ui.ws.spitex.open_count', { count: open })}
						</span>{:else}<span class="text-muted-foreground inline-flex items-center gap-1">
							<CircleCheck class="size-3" />{workspace.t('ui.ws.spitex.all_assigned')}
						</span>{/if}
				</button>
			{/each}
		</div>

		<div class="grid gap-4 xl:grid-cols-[18rem_1fr]">
			<Card.Root class="h-fit print:hidden">
				<Card.Header>
					<Card.Title>{workspace.t('ui.ws.spitex.open_visits')}</Card.Title><Card.Description>
						{workspace.t('ui.ws.spitex.open_text')}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<ul class="space-y-2">
						{#each model.open as visit (visit.id)}
							<li class="rounded-lg border border-dashed p-2 text-sm">
								<p class="font-medium">{visit.title}</p>
								<p class="text-muted-foreground text-xs">
									{workspace.t('ui.ws.spitex.window', { window: windowLabel(visit) })} · {visit.service
										? workspace.t(`ui.ws.spitex.service.${visit.service}`)
										: ''}
								</p>
								{#if canWrite}
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}<Button {...props} size="xs" variant="outline" class="mt-2">
													{workspace.t('ui.ws.spitex.assign')}
												</Button>{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="start">
											{#each staff as person (person.id)}
												{@const slot = firstFreeStart(visit, model.date, person.id, model.day)}
												<DropdownMenu.Item onclick={() => assignTo(visit, person.id)}>
													<span class="size-2 rounded-full" style:background-color={person.avatarColor}></span>
													<span class="flex-1">{person.name}</span>
													<span class="text-muted-foreground text-xs">
														{slot ? workspace.i18n.time(slot) : workspace.t('ui.ws.spitex.no_slot')}
													</span>
												</DropdownMenu.Item>
											{/each}
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								{/if}
							</li>
						{:else}
							<li class="text-muted-foreground flex items-center gap-2 text-sm">
								<CircleCheck class="size-4 text-emerald-600" />{workspace.t('ui.ws.spitex.none_open')}
							</li>
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>
			<div class="min-w-0 space-y-3">
				<TimeGrid {columns} {handlers} editable={canWrite} />
				<p class="text-muted-foreground text-xs print:hidden">{workspace.t('ui.ws.spitex.board_hint')}</p>
				<div class="overflow-x-auto rounded-xl border">
					<table class="w-full text-sm">
						<caption class="text-muted-foreground px-3 py-2 text-left text-xs">
							{workspace.t('ui.ws.spitex.week_load')}
						</caption>
						<thead>
							<tr class="border-y">
								<th class="px-3 py-1.5 text-left font-medium">
									{workspace.t('ui.ws.calendar.people')}
								</th>{#each model.week as day (day)}<th class="px-2 py-1.5 font-medium">
										{workspace.i18n.format(day, { weekday: 'short' })}
									</th>{/each}
							</tr>
						</thead>
						<tbody>
							{#each staff as person (person.id)}
								<tr class="border-b last:border-0">
									<td class="px-3 py-1.5">{person.name}</td>
									{#each model.week as day (day)}
										{@const minutes = model.minutesFor(person.id, day)}
										<td
											class="px-2 py-1.5 text-center tabular-nums {minutes > 8.5 * 60
												? 'text-destructive font-medium'
												: minutes === 0
													? 'text-muted-foreground'
													: ''}"
										>
											{minutes ? minutesToTime(minutes) : '–'}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</AsyncView>
</ModuleGate>

<AppointmentSheet
	bind:this={sheet}
	contacts={[...(model.resource.data?.contacts.values() ?? [])].filter((contact) => contact.tags.includes('Klient:in'))}
	people={people.people}
	appointments={model.day}
/>
