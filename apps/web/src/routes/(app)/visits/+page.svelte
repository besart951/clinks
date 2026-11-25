<script lang="ts">
	import { onMount } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import CalendarX from '@lucide/svelte/icons/calendar-x-2';
	import Phone from '@lucide/svelte/icons/phone';
	import { Button } from '@clinks/ui/components/ui/button';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import MapLink from '#lib/components/common/MapLink.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import DateJump from '#lib/components/calendar/DateJump.svelte';
	import { MyVisitsModel } from '#lib/features/spitex/my-visits.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { formatAddress } from '@clinks/domain/address';
	import { addDays, isoWeek, minutesBetween, today } from '@clinks/domain/dates';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new MyVisitsModel(workspace);
	const week = $derived(isoWeek(model.week));
	const range = $derived(
		`${workspace.i18n.format(model.week, { day: 'numeric', month: 'short' })} – ${workspace.i18n.format(addDays(model.week, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`,
	);
	onMount(() => model.resource.connect());
</script>

<svelte:head><title>{workspace.t('ui.ws.visits.title')} · CLinks</title></svelte:head>

<ModuleGate module="spitex" permission="spitex.own.read">
	<PageHeader title={workspace.t('ui.ws.visits.title')} description={workspace.t('ui.ws.visits.text')} />

	<div class="mb-4 flex flex-wrap items-center gap-2">
		<Button variant="outline" size="sm" onclick={() => model.go(0)}>{workspace.t('ui.ws.visits.this_week')}</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			onclick={() => model.go(-1)}
			aria-label={workspace.t('ui.ws.calendar.previous')}
		>
			<ChevronLeft class="size-4" />
		</Button>
		<Button variant="ghost" size="icon-sm" onclick={() => model.go(1)} aria-label={workspace.t('ui.ws.calendar.next')}>
			<ChevronRight class="size-4" />
		</Button>
		<DateJump value={model.week} units={['week']} initial="week" onpick={(_unit, date) => model.show(date)} />
		<h2 class="font-semibold" aria-live="polite">
			{workspace.t('ui.ws.spitex.release.week', { week })}
			<span class="text-muted-foreground font-normal">· {range}</span>
		</h2>
	</div>

	<AsyncView resource={model.resource} skeleton="detail">
		{#if !model.released}
			<EmptyState
				icon={CalendarClock}
				title={workspace.t('ui.ws.visits.pending_title', { week })}
				description={workspace.t('ui.ws.visits.pending_text')}
			/>
		{:else if model.days.length === 0}
			<EmptyState icon={CalendarX} title={workspace.t('ui.ws.visits.none_title')} />
		{:else}
			<div class="max-w-2xl space-y-6">
				{#each model.days as day (day.date)}
					<section aria-labelledby="day-{day.date}">
						<h3
							id="day-{day.date}"
							class="mb-2 flex items-baseline gap-2 text-sm font-semibold capitalize {day.date === today()
								? 'text-primary'
								: ''}"
						>
							{workspace.i18n.format(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}
							{#if day.date === today()}<span class="text-xs font-medium normal-case">
									{workspace.t('ui.ws.calendar.today')}
								</span>{/if}
							<span class="text-muted-foreground ms-auto text-xs font-normal normal-case">
								{workspace.t('ui.ws.spitex.count', { count: day.visits.length })}
							</span>
						</h3>
						<ul class="space-y-2">
							{#each day.visits as visit (visit.id)}
								{@const client = model.client(visit)}
								{@const address = client ? formatAddress(client.address) : visit.location}
								{@const change = model.change(visit)}
								{@const cancelled = visit.status === 'cancelled'}
								<li
									class="bg-card grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-xl border p-3 {cancelled
										? 'opacity-60'
										: ''}"
								>
									<div class="text-sm leading-tight tabular-nums">
										<b class="block font-semibold {cancelled ? 'line-through' : ''}">
											{workspace.i18n.time(visit.start)}
										</b>
										<span class="text-muted-foreground block">{workspace.i18n.time(visit.end)}</span>
										<span class="text-muted-foreground mt-1 block text-xs">
											{minutesBetween(visit.start, visit.end)} min
										</span>
									</div>
									<div class="min-w-0 space-y-1 text-sm">
										<p class="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
											<span class={cancelled ? 'line-through' : ''}>{client ? contactName(client) : visit.title}</span>
											{#if cancelled}
												<span class="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">
													{workspace.t('ui.ws.visits.cancelled')}
												</span>
											{:else if change}
												<span
													class="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300"
												>
													{workspace.t(`ui.ws.visits.${change}`)}
												</span>
											{/if}
										</p>
										<p class="text-muted-foreground">
											{#if visit.service}{workspace.t(`ui.ws.spitex.service.${visit.service}`)}{/if}
											{#if visit.arrivalWindow}
												· {workspace.t('ui.ws.spitex.window', {
													window: `${visit.arrivalWindow.from}–${visit.arrivalWindow.to}`,
												})}
											{/if}
										</p>
										{#if address}
											<p class="flex items-center gap-1">
												<span class="min-w-0">{address}</span>
												<MapLink place={address} class="touch-target" />
											</p>
										{/if}
										{#if client?.phone}
											<p>
												<a
													class="touch-target inline-flex items-center gap-1.5 hover:underline"
													href="tel:{client.phone}"
												>
													<Phone class="text-muted-foreground size-3.5" />{client.phone}
												</a>
											</p>
										{/if}
										{#if visit.notes}<p class="bg-muted rounded-md px-2 py-1.5 whitespace-pre-wrap">
												{visit.notes}
											</p>{/if}
									</div>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{/if}
	</AsyncView>
</ModuleGate>

<style>
	/* A fingertip needs 44px; with a mouse the controls stay compact. */
	@media (pointer: coarse) {
		:global(.touch-target) {
			min-block-size: 44px;
			min-inline-size: 44px;
		}
	}
</style>
