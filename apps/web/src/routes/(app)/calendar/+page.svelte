<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plus from '@lucide/svelte/icons/plus';
	import Filter from '@lucide/svelte/icons/filter';
	import * as Tabs from '@clinks/ui/components/ui/tabs';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui/components/ui/button';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import TimeGrid, { type GridColumn, type GridHandlers } from '#lib/components/calendar/TimeGrid.svelte';
	import MonthGrid from '#lib/components/calendar/MonthGrid.svelte';
	import AppointmentSheet from '#lib/components/calendar/AppointmentSheet.svelte';
	import { CalendarModel, type CalendarView } from '#lib/features/calendar/calendar.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { atTime, minutesToTime, today } from '@clinks/domain/dates';
	import { appointmentKinds, type Appointment } from '@clinks/domain/types';
	import type { ContactId } from '@clinks/domain/ids';
	import { routeQuery, setQuery } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const session = workspace.session;
	const model = new CalendarModel(workspace);
	const people = new PeopleDirectory(workspace);
	const canWrite = $derived(session.can('calendar.write'));
	let sheet: AppointmentSheet;

	const query = routeQuery(page.url);
	if (query.get('date')) model.anchor = query.get('date')!;
	if (query.get('view')) model.view = query.get('view') as CalendarView;
	else if (window.innerWidth < 768) model.view = 'day';

	onMount(() => {
		void people.load();
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
		color: (appointment) => people.get(appointment.assigneeId)?.avatarColor ?? '#a1a1aa',
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
		return model.days.map((day) => ({
			key: day,
			label: workspace.i18n.format(day, { weekday: 'short', day: 'numeric' }),
			sublabel: model.view === 'day' ? workspace.i18n.format(day, { month: 'long', year: 'numeric' }) : undefined,
			date: day,
			appointments: model.on(day),
			highlight: day === today(),
		}));
	});

	const rangeLabel = $derived.by(() => {
		const [from, to] = model.range;
		if (model.view === 'month') return workspace.i18n.format(model.anchor, { month: 'long', year: 'numeric' });
		if (model.view === 'week')
			return `${workspace.i18n.format(from, { day: 'numeric', month: 'short' })} – ${workspace.i18n.format(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
		return workspace.i18n.format(model.anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
	});

	function changeView(view: string) {
		model.setView(view as CalendarView);
		void setQuery(page.url, { view });
	}

	function openDay(date: string) {
		model.setAnchor(date);
		changeView('day');
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.module.calendar')} · CLinks</title></svelte:head>

<ModuleGate permission="calendar.read">
	<PageHeader title={workspace.t('ui.ws.module.calendar')}>
		{#snippet actions()}
			{#if canWrite}<Button onclick={() => create(model.anchor, 9 * 60, session.user?.id)} aria-keyshortcuts="N">
					<Plus class="size-4" />{workspace.t('ui.ws.command.new_appointment')}
				</Button>{/if}
		{/snippet}
	</PageHeader>

	<div class="mb-4 flex flex-wrap items-center gap-2">
		<Button variant="outline" size="sm" onclick={() => model.go(0)}>{workspace.t('ui.ws.calendar.today')}</Button>
		<div class="flex">
			<Button
				variant="ghost"
				size="icon-sm"
				onclick={() => model.go(-1)}
				aria-label={workspace.t('ui.ws.calendar.previous')}
			>
				<ChevronLeft class="size-4" />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				onclick={() => model.go(1)}
				aria-label={workspace.t('ui.ws.calendar.next')}
			>
				<ChevronRight class="size-4" />
			</Button>
		</div>
		<h2 class="min-w-0 text-base font-semibold capitalize" aria-live="polite">{rangeLabel}</h2>
		<div class="flex-1"></div>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}<Button {...props} variant="outline" size="sm">
						<Filter class="size-4" />{workspace.t('ui.filter')}
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
		<Tabs.Root value={model.view} onValueChange={changeView}>
			<Tabs.List>
				<Tabs.Trigger value="day">{workspace.t('ui.ws.calendar.view_day')}</Tabs.Trigger>
				<Tabs.Trigger value="week">{workspace.t('ui.ws.calendar.view_week')}</Tabs.Trigger>
				<Tabs.Trigger value="month">{workspace.t('ui.ws.calendar.view_month')}</Tabs.Trigger>
				<Tabs.Trigger value="resources">{workspace.t('ui.ws.calendar.view_resources')}</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
	</div>

	<AsyncView resource={model.resource} skeleton="detail">
		{#if model.view === 'month'}
			<MonthGrid
				days={model.days}
				month={model.anchor.slice(0, 7)}
				handlers={{
					appointmentsOn: (date) => model.on(date),
					color: handlers.color,
					open: handlers.open,
					day: openDay,
				}}
			/>
		{:else}
			<TimeGrid {columns} {handlers} editable={canWrite} />
			{#if canWrite}<p class="text-muted-foreground mt-2 text-xs">{workspace.t('ui.ws.calendar.hint')}</p>{/if}
		{/if}
	</AsyncView>
</ModuleGate>

<AppointmentSheet
	bind:this={sheet}
	contacts={[...(model.resource.data?.contacts.values() ?? [])]}
	people={people.people}
	appointments={model.resource.data?.appointments ?? []}
/>
