<script lang="ts">
	import { streetLine } from '@clinks/domain/address';
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
	import TimeGrid, {
		type GridColumn,
		type GridHandlers,
		type TimeAxis,
	} from '#lib/components/calendar/TimeGrid.svelte';
	import AxisToggle from '#lib/components/calendar/AxisToggle.svelte';
	import Grip from '@lucide/svelte/icons/grip-vertical';
	import Users from '@lucide/svelte/icons/users';
	import { personBadge } from '@clinks/ui/kit/avatar';
	import AppointmentSheet from '#lib/components/calendar/AppointmentSheet.svelte';
	import ContactFormSheet from '#lib/components/contacts/ContactFormSheet.svelte';
	import type { AppointmentFields } from '#lib/features/calendar/appointment-form.svelte';
	import { clientTag } from '#lib/features/spitex/clients.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { PlanningModel } from '#lib/features/spitex/planning.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { addDays, minutesToTime, today } from '@clinks/domain/dates';
	import { firstFreeStart } from '@clinks/domain/scheduling';
	import type { Appointment, Contact } from '@clinks/domain/types';
	import type { UserId } from '@clinks/domain/ids';
	import { href, routeQuery, setQuery } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new PlanningModel(workspace);
	const people = new PeopleDirectory(workspace);
	const canWrite = $derived(workspace.session.can('spitex.write') && workspace.session.can('calendar.write'));
	const canAddClient = $derived(canWrite && workspace.session.can('contacts.write'));
	let clientSheet: ContactFormSheet;
	const staff = $derived(people.people);
	/** Staff shown as columns; the menu «Mitarbeitende» hides the others. */
	const shown = $derived(staff.filter((person) => !model.hiddenPeople.includes(person.id)));

	function personHref(id: UserId) {
		return href(`/team/${id}?from=${encodeURIComponent('/spitex')}`);
	}
	let sheet: AppointmentSheet;
	/** The appointment open in the panel, highlighted in the grid. */
	let selectedId = $state<string | null>(null);
	const query = routeQuery(page.url);
	if (query.get('date')) model.date = query.get('date')!;
	let axis = $state<TimeAxis>(query.get('axis') === 'horizontal' ? 'horizontal' : 'vertical');
	/** The visit being dragged, from the list or inside the plan. */
	let dragging = $state<Appointment | null>(null);

	function changeAxis(next: TimeAxis) {
		axis = next;
		void setQuery(page.url, { axis: next === 'horizontal' ? next : null });
	}

	/** Drags the whole card, not just the handle, so the drag image shows what is being assigned. */
	function startDrag(event: DragEvent, visit: Appointment) {
		const card = (event.currentTarget as HTMLElement).closest('li');
		if (card) event.dataTransfer?.setDragImage(card, 16, 16);
		event.dataTransfer?.setData('text/plain', visit.id);
		dragging = visit;
	}

	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && createVisit());
		return () => {
			stop();
			stopShortcut();
		};
	});

	function createVisit(preset: Partial<AppointmentFields> = {}) {
		sheet.show(null, {
			kind: 'spitex',
			date: model.date,
			assigneeId: null,
			startTime: '08:00',
			endTime: '08:30',
			windowFrom: '08:00',
			windowTo: '08:30',
			...preset,
		});
	}

	/** A new client from the open visits: right after saving, their first (still open) visit can be planned. */
	function planFirstVisit(client: Contact) {
		createVisit({
			contactId: client.id,
			title: contactName(client),
			location: [streetLine(client.address), client.address.city].filter(Boolean).join(', '),
		});
	}

	const handlers: GridHandlers = {
		open: (appointment) => sheet.show(appointment),
		create: () => canWrite && createVisit(),
		drop: (appointment, _date, minutes, assigneeId) =>
			model.assign(appointment, assigneeId ?? null, assigneeId === null ? null : minutes),
		resize: (appointment, times) => model.retime(appointment, times),
		color: (appointment) => people.get(appointment.assigneeId)?.avatarColor ?? '#a1a1aa',
		assignee: (appointment) => people.get(appointment.assigneeId)?.name ?? null,
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
		...shown.map((person) => ({
			key: person.id,
			label: person.name,
			href: personHref(person.id),
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

	/** Staff for «Zuweisen»: whoever has the earliest free start first, those without room last. */
	function candidates(visit: Appointment) {
		return staff
			.map((person) => ({ person, slot: firstFreeStart(visit, model.date, person.id, model.day) }))
			.sort((left, right) =>
				left.slot && right.slot ? left.slot.localeCompare(right.slot) : left.slot ? -1 : right.slot ? 1 : 0,
			);
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
				<Button variant="outline" disabled={model.open.length === 0} onclick={() => model.autoAssign(shown)}>
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
		<div class="ms-auto flex items-center gap-2 print:hidden">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}<Button {...props} variant="outline" size="sm">
							<Users class="size-4" />{workspace.t('ui.ws.spitex.staff')}
							<span class="text-muted-foreground tabular-nums">
								{workspace.t('ui.ws.spitex.staff_shown', { shown: shown.length, total: staff.length })}
							</span>
						</Button>{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-64">
					<DropdownMenu.Label>{workspace.t('ui.ws.spitex.staff')}</DropdownMenu.Label>
					{#each staff as person (person.id)}
						<DropdownMenu.CheckboxItem
							checked={!model.hiddenPeople.includes(person.id)}
							onCheckedChange={() => model.togglePerson(person.id)}
							closeOnSelect={false}
						>
							<span class="size-2.5 shrink-0 rounded-full" style:background-color={person.avatarColor}></span>
							<span class="truncate">{person.name}</span>
						</DropdownMenu.CheckboxItem>
					{/each}
					{#if model.hiddenPeople.length > 0}
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={() => (model.hiddenPeople = [])}>
							{workspace.t('ui.ws.spitex.show_all')}
						</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			<AxisToggle {axis} onchange={changeAxis} />
		</div>
	</div>

	<!-- The appointment panel docks on the right on wide screens; the plan stays usable beside it. -->
	<div class="flex items-start gap-4">
		<div class="min-w-0 flex-1">
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
					<Card.Root class="group/open h-fit print:hidden">
						<Card.Header>
							<Card.Title>{workspace.t('ui.ws.spitex.open_visits')}</Card.Title><Card.Description>
								{workspace.t('ui.ws.spitex.open_text')}
							</Card.Description>
							{#if canAddClient}
								<Card.Action>
									<!-- Shown on hover and keyboard focus; always on touch screens, which cannot hover. -->
									<Button
										variant="ghost"
										size="icon-sm"
										class="opacity-0 transition-opacity group-focus-within/open:opacity-100 group-hover/open:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
										aria-label={workspace.t('ui.ws.spitex.new_client')}
										title={workspace.t('ui.ws.spitex.new_client')}
										onclick={() => clientSheet.show(null, { tags: [clientTag] })}
									>
										<Plus class="size-4" />
									</Button>
								</Card.Action>
							{/if}
						</Card.Header>
						<Card.Content>
							<ul class="space-y-2">
								{#each model.open as visit (visit.id)}
									<li
										class="bg-background relative rounded-lg border border-dashed p-2 text-sm {canWrite
											? 'ps-7'
											: ''} {dragging?.id === visit.id ? 'opacity-40' : ''}"
									>
										{#if canWrite}
											<!-- Pointer only; «Zuweisen» below is the keyboard and screen-reader way to do the same. -->
											<span
												draggable="true"
												aria-hidden="true"
												title={workspace.t('ui.ws.spitex.drag_visit', { title: visit.title })}
												class="text-muted-foreground hover:bg-muted hover:text-foreground absolute inset-y-1 start-1 flex w-5 cursor-grab items-center justify-center rounded select-none active:cursor-grabbing"
												ondragstart={(event) => startDrag(event, visit)}
												ondragend={() => (dragging = null)}
											>
												<Grip class="size-4" />
											</span>
										{/if}
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
												<DropdownMenu.Content align="start" class="w-72">
													<DropdownMenu.Label class="text-muted-foreground text-xs font-normal">
														{workspace.t('ui.ws.spitex.assign_to', { title: visit.title })}
													</DropdownMenu.Label>
													{#each candidates(visit) as { person, slot } (person.id)}
														<DropdownMenu.Item class="gap-2.5 py-1.5" onclick={() => assignTo(visit, person.id)}>
															<span
																class="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
																style:background-color={person.avatarColor}
																aria-hidden="true"
															>
																{personBadge(person.name).initials}
															</span>
															<span class="min-w-0 flex-1">
																<span class="block truncate font-medium">{person.name}</span>
																{#if person.jobTitle}<span class="text-muted-foreground block truncate text-xs">
																		{person.jobTitle}
																	</span>{/if}
															</span>
															{#if slot}
																<span class="bg-muted rounded px-1.5 py-0.5 text-xs font-medium tabular-nums">
																	{workspace.i18n.time(slot)}
																</span>
															{:else}
																<span class="text-muted-foreground text-xs">{workspace.t('ui.ws.spitex.no_slot')}</span>
															{/if}
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
						<TimeGrid {columns} {handlers} {axis} {selectedId} bind:dragging editable={canWrite} />
						<p class="text-muted-foreground text-xs print:hidden">
							{workspace.t(axis === 'horizontal' ? 'ui.ws.spitex.board_hint_horizontal' : 'ui.ws.spitex.board_hint')}
						</p>
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
									{#each shown as person (person.id)}
										<tr class="border-b last:border-0">
											<td class="px-3 py-1.5">
												<a class="hover:underline" href={personHref(person.id)}>{person.name}</a>
											</td>
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
		</div>
		<AppointmentSheet
			bind:this={sheet}
			bind:selectedId
			docked
			contacts={[...(model.resource.data?.contacts.values() ?? [])].filter((contact) =>
				contact.tags.includes('Klient:in'),
			)}
			people={people.people}
			appointments={model.day}
		/>
	</div>
</ModuleGate>
<ContactFormSheet bind:this={clientSheet} onSaved={planFirstVisit} />
