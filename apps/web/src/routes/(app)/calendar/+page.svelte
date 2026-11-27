<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Plus from '@lucide/svelte/icons/plus';
	import Filter from '@lucide/svelte/icons/filter';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import CalendarRange from '@lucide/svelte/icons/calendar-range';
	import Columns3 from '@lucide/svelte/icons/columns-3';
	import UsersIcon from '@lucide/svelte/icons/users';
	import * as Tabs from '@clinks/ui/components/ui/tabs';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui/components/ui/button';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import TimeGrid, { type GridColumn, type GridHandlers } from '#lib/components/calendar/TimeGrid.svelte';
	import CalendarToolbar from '#lib/components/calendar/CalendarToolbar.svelte';
	import FloatingAddButton from '#lib/components/common/FloatingAddButton.svelte';
	import { AxisSetting } from '#lib/features/calendar/axis.svelte';
	import MonthGrid from '#lib/components/calendar/MonthGrid.svelte';
	import AppointmentSheet from '#lib/components/calendar/AppointmentSheet.svelte';
	import { CalendarModel, type CalendarView } from '#lib/features/calendar/calendar.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { atTime, isoWeekday, minutesToTime, startOfWeek, today, weekDays } from '@clinks/domain/dates';
	import { appointmentKinds, type Appointment } from '@clinks/domain/types';
	import type { ContactId } from '@clinks/domain/ids';
	import { href, routeQuery, setQuery } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const session = workspace.session;
	const query = routeQuery(page.url);
	const model = new CalendarModel(workspace, {
		anchor: query.get('date') ?? undefined,
		view: (query.get('view') as CalendarView | null) ?? (window.innerWidth < 768 ? 'day' : undefined),
		onview: (view) => void setQuery(page.url, { view }),
	});
	const period = model.period;
	const axis = new AxisSetting(page.url);
	const people = new PeopleDirectory(workspace);
	const canWrite = $derived(session.can('calendar.write'));
	let sheet: AppointmentSheet;
	/** The appointment open in the panel, highlighted in the grid. */
	let selectedId = $state<string | null>(null);

	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && create(model.anchor, 9 * 60, session.user?.id));
		void openFromQuery();
		return () => {
			stop();
			stopShortcut();
		};
	});

	async function openFromQuery() {
		const appointmentId = query.get('appointment');
		if (query.get('new') === '1' && canWrite) {
			create(model.anchor, 9 * 60, session.user?.id, (query.get('contact') as ContactId | null) ?? null);
		} else if (appointmentId) {
			const appointment =
				model.find(appointmentId) ??
				(await workspace.api.appointments.get(appointmentId as Appointment['id']).catch(() => null));
			if (appointment) sheet.show(appointment);
		}
	}

	function create(
		date: string,
		minutes: number,
		assigneeId: Appointment['assigneeId'] | undefined,
		contactId: ContactId | null = null,
	) {
		const contact = contactId ? model.resource.data?.contacts.get(contactId) : undefined;
		sheet.show(null, {
			date,
			startTime: minutesToTime(minutes),
			endTime: minutesToTime(Math.min(minutes + 30, 23 * 60)),
			assigneeId: assigneeId === undefined ? (session.user?.id ?? null) : assigneeId,
			contactId,
			title: contact ? contactName(contact) : '',
		});
	}

	const handlers: GridHandlers = {
		open: (appointment) => sheet.show(appointment),
		create: (date, minutes, assigneeId) => create(date, minutes, assigneeId),
		drop: (appointment, date, minutes, assigneeId) =>
			model.move(
				appointment,
				new Date(atTime(date, minutesToTime(minutes))),
				assigneeId === undefined ? appointment.assigneeId : assigneeId,
			),
		resize: (appointment, times) => model.retime(appointment, times),
		color: (appointment) => people.get(appointment.assigneeId)?.avatarColor ?? '#a1a1aa',
		assignee: (appointment) => people.get(appointment.assigneeId)?.name ?? null,
		subtitle: (appointment) =>
			people.get(appointment.assigneeId)?.name.split(' ')[0] ?? workspace.t('ui.ws.calendar.open'),
	};

	const columns = $derived.by((): GridColumn[] => {
		if (model.view === 'resources') {
			const staff = people.people.filter((person) => !model.hiddenPeople.includes(person.id));
			return [
				...staff.map((person) => ({
					key: person.id,
					label: person.name,
					href: href(`/team/${person.id}?from=${encodeURIComponent('/calendar?view=resources')}`),
					sublabel: person.jobTitle,
					date: model.anchor,
					assigneeId: person.id,
					appointments: model.on(model.anchor, person.id),
				})),
				...(model.showOpen
					? [
							{
								key: 'open',
								label: workspace.t('ui.ws.calendar.open'),
								date: model.anchor,
								assigneeId: null,
								appointments: model.on(model.anchor, null),
							},
						]
					: []),
			];
		}
		return period.shownDays.map((day) => ({
			key: day,
			label: workspace.i18n.format(day, { weekday: 'short', day: 'numeric' }),
			hide:
				model.view === 'week' && period.shownDays.length > 1
					? {
							label: workspace.t('ui.ws.calendar.hide_day', {
								day: workspace.i18n.format(day, { weekday: 'short' }),
							}),
							run: () => period.hideWeekday(isoWeekday(day)),
						}
					: undefined,
			sublabel: model.view === 'day' ? workspace.i18n.format(day, { month: 'long', year: 'numeric' }) : undefined,
			date: day,
			appointments: model.on(day),
			highlight: day === today(),
		}));
	});

	function changeView(view: string) {
		model.setView(view as CalendarView);
	}

	const views = [
		{ value: 'day', label: 'ui.ws.calendar.view_day', icon: CalendarDays },
		{ value: 'week', label: 'ui.ws.calendar.view_week', icon: Columns3 },
		{ value: 'month', label: 'ui.ws.calendar.view_month', icon: CalendarRange },
		{ value: 'resources', label: 'ui.ws.calendar.view_resources', icon: UsersIcon },
	] as const;

	/** Filters that hide something, for the badge on the button. */
	const filterCount = $derived(model.hiddenPeople.length + model.hiddenKinds.length + (model.showOpen ? 0 : 1));

	function openDay(date: string) {
		period.setAnchor(date);
		changeView('day');
	}
</script>

{#snippet filterMenu()}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}<Button {...props} variant="outline" size="sm">
					<Filter class="size-4" />{workspace.t('ui.filter')}{#if filterCount > 0}<span
							class="bg-primary text-primary-foreground grid min-w-5 place-items-center rounded-full px-1 text-[11px] tabular-nums"
						>
							{filterCount}<span class="sr-only">{workspace.t('ui.ws.calendar.filters_active')}</span>
						</span>{/if}
				</Button>{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-60">
			<DropdownMenu.Label>{workspace.t('ui.ws.calendar.people')}</DropdownMenu.Label>
			{#each people.people as person (person.id)}
				<DropdownMenu.CheckboxItem
					checked={!model.hiddenPeople.includes(person.id)}
					onCheckedChange={() => model.togglePerson(person.id)}
					closeOnSelect={false}
				>
					<span class="size-2.5 rounded-full" style:background-color={person.avatarColor}></span>{person.name}
				</DropdownMenu.CheckboxItem>
			{/each}
			<DropdownMenu.CheckboxItem bind:checked={model.showOpen} closeOnSelect={false}>
				{workspace.t('ui.ws.calendar.open')}
			</DropdownMenu.CheckboxItem>
			<DropdownMenu.Separator />
			<DropdownMenu.Label>{workspace.t('ui.ws.calendar.kind')}</DropdownMenu.Label>
			{#each appointmentKinds as kind (kind)}
				<DropdownMenu.CheckboxItem
					checked={!model.hiddenKinds.includes(kind)}
					onCheckedChange={() => model.toggleKind(kind)}
					closeOnSelect={false}
				>
					{workspace.t(`ui.ws.calendar.kind_${kind}`)}
				</DropdownMenu.CheckboxItem>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

<svelte:head><title>{workspace.t('ui.ws.module.calendar')} · CLinks</title></svelte:head>

<ModuleGate permission="calendar.read">
	<PageHeader title={workspace.t('ui.ws.module.calendar')} description={workspace.t('ui.ws.calendar.page_text')}>
		{#snippet actions()}
			{#if canWrite}<Button
					class="hidden md:inline-flex"
					onclick={() => create(model.anchor, 9 * 60, session.user?.id)}
					aria-keyshortcuts="N"
				>
					<Plus class="size-4" />{workspace.t('ui.ws.command.new_appointment')}
				</Button>{/if}
		{/snippet}
	</PageHeader>

	<!-- Phones: views across the width; the toolbar's period below, then the week to pick a day from. -->
	<div class="mb-3 space-y-3 md:hidden">
		<div
			class="bg-muted grid grid-cols-4 gap-1 rounded-xl p-1"
			role="group"
			aria-label={workspace.t('ui.ws.calendar.views')}
		>
			{#each views as view (view.value)}
				<button
					type="button"
					class="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-medium transition-colors {model.view ===
					view.value
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={model.view === view.value}
					onclick={() => changeView(view.value)}
				>
					<view.icon class="size-4" />{workspace.t(view.label)}
				</button>
			{/each}
		</div>
	</div>

	<CalendarToolbar {period} axis={model.view === 'month' ? undefined : axis}>
		{#snippet actions()}
			{@render filterMenu()}
			<Tabs.Root value={model.view} onValueChange={changeView} class="hidden md:flex">
				<Tabs.List>
					<Tabs.Trigger value="day">{workspace.t('ui.ws.calendar.view_day')}</Tabs.Trigger>
					<Tabs.Trigger value="week">{workspace.t('ui.ws.calendar.view_week')}</Tabs.Trigger>
					<Tabs.Trigger value="month">{workspace.t('ui.ws.calendar.view_month')}</Tabs.Trigger>
					<Tabs.Trigger value="resources">{workspace.t('ui.ws.calendar.view_resources')}</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
		{/snippet}
	</CalendarToolbar>
	{#if model.view === 'day' || model.view === 'resources'}
		<div class="mb-3 md:hidden">
			<div
				class="grid auto-cols-fr grid-flow-col gap-1"
				role="group"
				aria-label={workspace.t('ui.ws.calendar.view_week')}
			>
				{#each period.withoutHidden(weekDays(startOfWeek(model.anchor), 7)) as day (day)}
					{@const selected = day === model.anchor}
					{@const busy = model.on(day).length > 0}
					<button
						type="button"
						class="flex min-h-14 flex-col items-center justify-center rounded-xl border text-xs transition-colors {selected
							? 'border-primary bg-primary text-primary-foreground'
							: day === today()
								? 'border-primary/50 text-primary'
								: 'hover:bg-accent'} {isoWeekday(day) >= 6 && !selected ? 'text-muted-foreground' : ''}"
						aria-pressed={selected}
						aria-current={day === today() ? 'date' : undefined}
						aria-label={workspace.i18n.format(day, { weekday: 'long', day: 'numeric', month: 'long' })}
						onclick={() => period.setAnchor(day)}
					>
						<span>{workspace.i18n.format(day, { weekday: 'short' })}</span>
						<span class="text-sm font-semibold tabular-nums">{Number(day.slice(8))}</span>
						<span
							class="size-1 rounded-full {busy ? (selected ? 'bg-primary-foreground' : 'bg-primary') : ''}"
							aria-hidden="true"
						></span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- The appointment panel docks on the right on wide screens; the plan stays usable beside it. -->
	<div class="flex items-start gap-4">
		<div class="min-w-0 flex-1">
			<AsyncView resource={model.resource} skeleton="detail">
				{#if model.view === 'month'}
					<MonthGrid
						bind:selectedId
						days={period.shownDays}
						month={model.anchor.slice(0, 7)}
						handlers={{
							appointmentsOn: (date) => model.on(date),
							color: handlers.color,
							open: handlers.open,
							day: openDay,
							hideWeekday: (weekday) => period.hideWeekday(weekday),
						}}
					/>
				{:else}
					<TimeGrid {columns} {handlers} axis={axis.value} bind:selectedId editable={canWrite} />
					{#if model.view === 'day' || model.view === 'resources'}
						{@const summary = model.daySummary(model.anchor)}
						<dl class="bg-card mt-3 grid grid-cols-3 divide-x rounded-xl border py-3 text-center">
							<div class="px-2">
								<dt class="text-muted-foreground text-xs">{workspace.t('ui.ws.calendar.summary_count')}</dt>
								<dd class="text-lg font-semibold tabular-nums">{summary.count}</dd>
							</div>
							<div class="px-2">
								<dt class="text-muted-foreground text-xs">{workspace.t('ui.ws.calendar.summary_time')}</dt>
								<dd class="text-lg font-semibold tabular-nums">
									{workspace.t('ui.ws.calendar.hours', {
										hours: (summary.minutes / 60).toLocaleString(workspace.i18n.locale, { maximumFractionDigits: 1 }),
									})}
								</dd>
							</div>
							<div class="px-2">
								<dt class="text-muted-foreground text-xs">{workspace.t('ui.ws.calendar.summary_open')}</dt>
								<dd
									class="text-lg font-semibold tabular-nums {summary.open > 0
										? 'text-amber-700 dark:text-amber-400'
										: ''}"
								>
									{summary.open}
								</dd>
							</div>
						</dl>
					{/if}
					{#if canWrite}<p class="text-muted-foreground mt-2 hidden text-xs md:block">
							{workspace.t(axis.value === 'horizontal' ? 'ui.ws.calendar.hint_horizontal' : 'ui.ws.calendar.hint')}
						</p>{/if}
				{/if}
			</AsyncView>
		</div>
		<AppointmentSheet
			bind:this={sheet}
			bind:selectedId
			docked
			contacts={[...(model.resource.data?.contacts.values() ?? [])]}
			people={people.people}
			appointments={model.resource.data?.appointments ?? []}
		/>
	</div>
	{#if canWrite}
		<FloatingAddButton
			label={workspace.t('ui.ws.command.new_appointment')}
			onclick={() => create(model.anchor, 9 * 60, session.user?.id)}
		/>
	{/if}
</ModuleGate>
