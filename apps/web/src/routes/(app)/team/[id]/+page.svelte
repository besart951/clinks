<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Mail from '@lucide/svelte/icons/mail';
	import { Button } from '@clinks/ui/components/ui/button';
	import SideCard from '@clinks/ui/kit/SideCard.svelte';
	import { personBadge } from '@clinks/ui/kit/avatar';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import DetailHeader from '#lib/components/kit/DetailHeader.svelte';
	import CalendarToolbar from '#lib/components/calendar/CalendarToolbar.svelte';
	import MailLink from '#lib/components/common/MailLink.svelte';
	import { useWriteMail } from '#lib/features/mail/write-mail.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { PersonDetailModel } from '#lib/features/team/person-detail.svelte';
	import { minutesToTime, today, toCalendarDate } from '@clinks/domain/dates';
	import type { Appointment } from '@clinks/domain/types';
	import type { UserId } from '@clinks/domain/ids';
	import { href, routeQuery } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const writeMail = useWriteMail();
	const id = page.params.id as UserId;
	const people = new PeopleDirectory(workspace);
	const person = $derived(people.get(id));
	const model = new PersonDetailModel(workspace, id);
	/** Where the person was opened from (calendar, Spitex plan …), for the back link. */
	const from = routeQuery(page.url).get('from') ?? '/calendar?view=resources';
	/** A full working day, the scale of the workload bars. */
	const fullDay = 8.5 * 60;
	const weekMinutes = $derived(model.days.reduce((sum, day) => sum + model.minutesOn(day), 0));
	/** The calendar opens on today within the current week, else on the week's Monday. */
	const calendarDate = $derived(model.period.showsToday ? today() : model.week);

	onMount(() => model.resource.connect());

	function serviceLabel(appointment: Appointment) {
		if (!appointment.service) return workspace.t(`ui.ws.calendar.kind_${appointment.kind}`);
		return workspace.t(
			appointment.kind === 'physio'
				? (`ui.ws.physio.service.${appointment.service}` as const)
				: (`ui.ws.spitex.service.${appointment.service}` as const),
		);
	}
</script>

<svelte:head><title>{person?.name ?? workspace.t('ui.ws.calendar.people')} · CLinks</title></svelte:head>

{#if person}
	<DetailHeader
		header={{
			title: person.name,
			back: { label: workspace.t('ui.ws.person.back'), path: from },
			avatar: personBadge(person.name),
			meta: [person.jobTitle, person.email].filter(Boolean),
		}}
	>
		{#snippet actions()}
			{#if workspace.session.can('calendar.read')}
				<Button variant="outline" href={href(`/calendar?view=resources&date=${calendarDate}`)}>
					<CalendarDays class="size-4" />{workspace.t('ui.ws.person.in_calendar')}
				</Button>
			{/if}
			<Button variant="outline" onclick={() => writeMail.write(person.email)}>
				<Mail class="size-4" />{workspace.t('ui.ws.person.write_mail')}
			</Button>
		{/snippet}
	</DetailHeader>

	<AsyncView resource={model.resource} skeleton="detail">
		<div class="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
			<div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
				<section class="bg-card grid grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border p-5 shadow-[var(--shadow-sm)]">
					<header class="flex flex-wrap items-center gap-2">
						<h2 class="text-sm font-semibold">{workspace.t('ui.ws.person.appointments')}</h2>
					</header>
					<CalendarToolbar period={model.period} />
					{#if (model.resource.data?.appointments.length ?? 0) === 0}
						<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.person.no_appointments')}</p>
					{:else}
						{#each model.days as day (day)}
							{@const rows = model.on(day)}
							{#if rows.length > 0}
								<div>
									<h3 class="text-muted-foreground mb-1 text-xs font-medium capitalize">
										{workspace.i18n.format(day, { weekday: 'long', day: 'numeric', month: 'long' })}
									</h3>
									<ul>
										{#each rows as appointment (appointment.id)}
											<li>
												<a
													class="hover:bg-accent grid h-9 grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1 text-[13px]"
													href={href(
														`/calendar?date=${toCalendarDate(appointment.start)}&appointment=${appointment.id}`,
													)}
												>
													<span class="text-muted-foreground tabular-nums">
														{workspace.i18n.time(appointment.start)}–{workspace.i18n.time(appointment.end)}
													</span>
													<span class="truncate font-medium">{appointment.title}</span>
													<span class="text-muted-foreground truncate text-xs">{serviceLabel(appointment)}</span>
												</a>
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						{/each}
					{/if}
				</section>
				{#if workspace.session.can('planner.read') && workspace.session.hasModule('planner')}
					<section class="bg-card grid grid-cols-[minmax(0,1fr)] gap-2 rounded-xl border p-5 shadow-[var(--shadow-sm)]">
						<h2 class="text-sm font-semibold">
							{workspace.t('ui.ws.person.tasks')}
							<span class="text-muted-foreground font-normal tabular-nums">
								{model.resource.data?.tasks.length ?? 0}
							</span>
						</h2>
						{#each model.resource.data?.tasks ?? [] as task (task.id)}
							<a
								class="hover:bg-accent flex h-9 items-center gap-2 rounded-md px-1 text-[13px]"
								href={href(`/planner/${task.id}`)}
							>
								<span class="bg-input size-2 shrink-0 rounded-full" aria-hidden="true"></span>
								<span class="min-w-0 flex-1 truncate">{task.title}</span>
								<span class="text-muted-foreground text-xs">{workspace.t(`ui.ws.task.status.${task.status}`)}</span>
								{#if task.dueDate}<span class="text-muted-foreground text-xs tabular-nums">
										{workspace.i18n.date(task.dueDate)}
									</span>{/if}
							</a>
						{:else}
							<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.person.no_tasks')}</p>
						{/each}
					</section>
				{/if}
			</div>
			<aside class="grid min-w-0 gap-4 lg:sticky lg:top-4">
				<SideCard card={{ title: workspace.t('ui.ws.person.load') }}>
					<p class="text-muted-foreground text-xs">
						{workspace.t('ui.ws.person.load_total', { time: minutesToTime(weekMinutes) })}
					</p>
					<ul class="grid gap-1.5">
						{#each model.days as day (day)}
							{@const minutes = model.minutesOn(day)}
							<li class="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-xs">
								<span class="text-muted-foreground">{workspace.i18n.format(day, { weekday: 'short' })}</span>
								<span class="bg-muted h-2 overflow-hidden rounded-full" aria-hidden="true">
									<span
										class="block h-full rounded-full"
										style:width="{Math.min(100, (minutes / fullDay) * 100)}%"
										style:background-color={minutes > fullDay ? 'var(--destructive)' : person.avatarColor}
									></span>
								</span>
								<span class="text-right tabular-nums {minutes > fullDay ? 'text-destructive font-medium' : ''}">
									{minutes ? minutesToTime(minutes) : '–'}
								</span>
							</li>
						{/each}
					</ul>
				</SideCard>
				<SideCard card={{ title: workspace.t('ui.ws.person.contact') }}>
					<span class="flex items-center gap-1 text-sm">{person.email}<MailLink address={person.email} /></span>
				</SideCard>
			</aside>
		</div>
	</AsyncView>
{:else if people.people.length > 0}
	<EmptyState title={workspace.t('ui.ws.person.not_found')} />
{/if}
