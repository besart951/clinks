<script lang="ts">
	import { streetLine } from '@clinks/domain/address';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
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
	import WeekRelease from '#lib/components/spitex/WeekRelease.svelte';
	import TimeGrid, { type GridColumn, type GridHandlers } from '#lib/components/calendar/TimeGrid.svelte';
	import CalendarToolbar from '#lib/components/calendar/CalendarToolbar.svelte';
	import { AxisSetting } from '#lib/features/calendar/axis.svelte';
	import FloatingAddButton from '#lib/components/common/FloatingAddButton.svelte';
	import Grip from '@lucide/svelte/icons/grip-vertical';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Users from '@lucide/svelte/icons/users';
	import { personBadge } from '@clinks/ui/kit/avatar';
	import AppointmentSheet from '#lib/components/calendar/AppointmentSheet.svelte';
	import ContactFormSheet from '#lib/components/contacts/ContactFormSheet.svelte';
	import type { AppointmentFields } from '#lib/features/calendar/appointment-form.svelte';
	import { clientTag } from '#lib/features/spitex/clients.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { PlanningModel } from '#lib/features/spitex/planning.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { minutesToTime } from '@clinks/domain/dates';
	import { firstFreeStart } from '@clinks/domain/scheduling';
	import type { Appointment, Contact } from '@clinks/domain/types';
	import type { UserId } from '@clinks/domain/ids';
	import { href, routeQuery } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const query = routeQuery(page.url);
	const model = new PlanningModel(workspace, query.get('date') ?? undefined);
	const axis = new AxisSetting(page.url);
	const people = new PeopleDirectory(workspace);
	const canWrite = $derived(workspace.session.can('spitex.write') && workspace.session.can('calendar.write'));
	const canAddClient = $derived(canWrite && workspace.session.can('contacts.write'));
	const canEditClients = $derived(workspace.session.can('contacts.write'));
	const canRelease = $derived(workspace.session.can('spitex.release'));
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
	/** The visit being dragged, from the list or inside the plan. */
	let dragging = $state<Appointment | null>(null);
	/** The open visit pointed at in the list: the plan shows its arrival window. */
	let pointedVisit = $state<Appointment | null>(null);

	/** Drags the whole card, not just the handle, so the drag image shows what is being assigned. */
	function startDrag(event: DragEvent, visit: Appointment) {
		const card = (event.currentTarget as HTMLElement).closest('li');
		if (card) event.dataTransfer?.setDragImage(card, 16, 16);
		event.dataTransfer?.setData('text/plain', visit.id);
		dragging = visit;
		pointedVisit = null;
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
		mark: (appointment) =>
			model.changedSinceRelease(appointment) ? workspace.t('ui.ws.spitex.release.changed') : null,
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
			sublabel: dayLoad(person.id),
			date: model.date,
			assigneeId: person.id,
			appointments: model.day.filter((row) => row.assigneeId === person.id),
		})),
	]);

	/** «4:45 h geplant» under each person's name, so the day's load shows where visits are planned. */
	function dayLoad(userId: UserId) {
		const minutes = model.minutesFor(userId, model.date);
		return minutes
			? workspace.t('ui.ws.spitex.day_load', { time: hours(minutes) })
			: workspace.t('ui.ws.spitex.day_free');
	}

	/** «4:45» rather than «04:45», to fit the narrow week table. */
	const hours = (minutes: number) => minutesToTime(minutes).replace(/^0/u, '');

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

	function clientOf(visit: Appointment) {
		return visit.contactId ? (model.resource.data?.contacts.get(visit.contactId) ?? null) : null;
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
			<Button variant="outline" class="hidden md:inline-flex" onclick={() => workspace.platform.files.print()}>
				<Printer class="size-4" />{workspace.t('ui.ws.spitex.print_plan')}
			</Button>
			{#if canWrite}
				<Button variant="outline" disabled={model.open.length === 0} onclick={() => model.autoAssign(shown)}>
					<Wand class="size-4" />{workspace.t('ui.ws.spitex.auto_assign')}
				</Button>
				<Button
					variant={model.release || !canRelease ? 'default' : 'outline'}
					class="hidden md:inline-flex"
					onclick={createVisit}
					aria-keyshortcuts="N"
				>
					<Plus class="size-4" />{workspace.t('ui.ws.spitex.new_visit')}
				</Button>
			{/if}
			<WeekRelease {model} {people} part="actions" />
		{/snippet}
	</PageHeader>
	<SpitexNav />

	<CalendarToolbar period={model.period} {axis}>
		{#snippet status()}<WeekRelease {model} {people} part="status" />{/snippet}
		{#snippet actions()}
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
		{/snippet}
	</CalendarToolbar>

	<!-- The appointment panel docks on the right on wide screens; the plan stays usable beside it. -->
	<div class="flex items-start gap-4">
		<div class="min-w-0 flex-1">
			<AsyncView resource={model.resource} skeleton="detail">
				<div
					class="mb-4 grid auto-cols-fr grid-flow-col gap-1 text-center text-xs"
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
							<!-- Phones: weekday over the date, and the state as a number or a tick. -->
							<span class="block font-medium sm:hidden">
								{workspace.i18n.format(day, { weekday: 'short' })}<br /><span class="text-sm tabular-nums">
									{Number(day.slice(8))}
								</span>
							</span>
							<span class="hidden font-medium sm:block">
								{workspace.i18n.format(day, { weekday: 'short', day: 'numeric' })}
							</span>
							{#if open > 0}<span class="text-amber-700 dark:text-amber-400">
									<span class="sm:hidden" aria-hidden="true">{open}</span><span class="max-sm:sr-only">
										{workspace.t('ui.ws.spitex.open_count', { count: open })}
									</span>
								</span>{:else}<span class="inline-flex items-center text-emerald-600 dark:text-emerald-400">
									<CircleCheck class="size-4" aria-hidden="true" /><span class="sr-only">
										{workspace.t('ui.ws.spitex.all_assigned')}
									</span>
								</span>{/if}
						</button>
					{/each}
				</div>

				<div class="grid gap-4 xl:grid-cols-[18rem_1fr]">
					<!-- Phones: open visits, then the plan, then the week's load; wide screens keep the side column. -->
					<div class="space-y-4 max-xl:contents">
						<Card.Root class="group/open h-fit max-xl:order-1 print:hidden">
							<Card.Header>
								<Card.Title>{workspace.t('ui.ws.spitex.open_visits')}</Card.Title>
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
											class="group/visit bg-background relative rounded-lg border border-dashed p-2 text-sm {canWrite
												? 'ps-7'
												: ''} {dragging?.id === visit.id ? 'opacity-40' : ''}"
											onpointerenter={() => (pointedVisit = visit)}
											onpointerleave={() => (pointedVisit = null)}
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
											{#if canEditClients && clientOf(visit)}
												{@const client = clientOf(visit)!}
												<Button
													size="icon-xs"
													variant="ghost"
													class="absolute end-1 top-1 opacity-0 transition-opacity group-focus-within/visit:opacity-100 group-hover/visit:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
													aria-label={workspace.t('ui.ws.spitex.edit_client', { name: contactName(client) })}
													title={workspace.t('ui.ws.spitex.edit_client', { name: contactName(client) })}
													onclick={() => clientSheet.show(client)}
												>
													<Pencil class="size-3.5" />
												</Button>
											{/if}
											<p class="pe-6 font-medium">{visit.title}</p>
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
																	<span class="text-muted-foreground text-xs">
																		{workspace.t('ui.ws.spitex.no_slot')}
																	</span>
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
						<Card.Root class="h-fit max-xl:order-3">
							<Card.Header>
								<Card.Title>{workspace.t('ui.ws.spitex.week_load_title')}</Card.Title>
							</Card.Header>
							<Card.Content>
								<table class="w-full table-fixed text-[11px] tabular-nums">
									<caption class="sr-only">{workspace.t('ui.ws.spitex.week_load')}</caption>
									<thead>
										<tr class="text-muted-foreground">
											<th class="w-8 pb-1 text-left font-normal">
												<span class="sr-only">{workspace.t('ui.ws.calendar.people')}</span>
											</th>
											{#each model.week as day (day)}
												<th
													class="pb-1 font-normal {day === model.date ? 'text-foreground font-semibold' : ''}"
													aria-current={day === model.date ? 'date' : undefined}
												>
													{workspace.i18n.format(day, { weekday: 'narrow' })}
												</th>
											{/each}
										</tr>
									</thead>
									<tbody>
										{#each shown as person (person.id)}
											<tr>
												<th scope="row" class="py-0.5 text-left font-normal">
													<a
														href={personHref(person.id)}
														class="grid size-6 place-items-center rounded-full text-[10px] font-semibold text-white hover:ring-2 hover:ring-current/30"
														style:background-color={person.avatarColor}
														title={person.name}
													>
														<span aria-hidden="true">{personBadge(person.name).initials}</span>
														<span class="sr-only">{person.name}</span>
													</a>
												</th>
												{#each model.week as day (day)}
													{@const minutes = model.minutesFor(person.id, day)}
													<td
														class="py-0.5 text-center {day === model.date ? 'bg-muted' : ''} {minutes > 8.5 * 60
															? 'text-destructive font-semibold'
															: minutes === 0
																? 'text-muted-foreground/60'
																: ''}"
													>
														{minutes ? hours(minutes) : '–'}
													</td>
												{/each}
											</tr>
										{/each}
									</tbody>
								</table>
							</Card.Content>
						</Card.Root>
					</div>
					<div class="min-w-0 max-xl:order-2">
						<TimeGrid
							{columns}
							{handlers}
							axis={axis.value}
							{selectedId}
							bind:dragging
							focus={pointedVisit}
							editable={canWrite}
						/>
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
	{#if canWrite}
		<FloatingAddButton label={workspace.t('ui.ws.spitex.new_visit')} onclick={() => createVisit()} />
	{/if}
</ModuleGate>
<ContactFormSheet bind:this={clientSheet} onSaved={(client, created) => created && planFirstVisit(client)} />
