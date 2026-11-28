<script lang="ts" module>
	import type { Appointment, CalendarDate } from '@clinks/domain/types';

	export interface MonthHandlers {
		appointmentsOn(date: CalendarDate): Appointment[];
		label?(appointment: Appointment): string;
		color(appointment: Appointment): string;
		open(appointment: Appointment): void;
		day(date: CalendarDate): void;
		/** Hides an ISO weekday (1 = Monday); the button shows when the weekday's header is hovered. */
		hideWeekday?(weekday: number): void;
	}
</script>

<script lang="ts">
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import { isoWeekday, today } from '@clinks/domain/dates';
	import { useWorkspace } from '#lib/workspace.svelte';
	import { appointmentPress } from '#lib/features/calendar/press';

	/** `days` are the weeks of the month without hidden weekdays, so each row has as many days as there are columns. */
	let {
		days,
		month,
		handlers,
		selectedId = $bindable(null),
	}: {
		days: CalendarDate[];
		month: string;
		handlers: MonthHandlers;
		/** The marked appointment, as in the time grid: a click marks it, a double click opens it. */
		selectedId?: string | null;
	} = $props();
	const workspace = useWorkspace();
	const weekdays = $derived([...new Set(days.map(isoWeekday))].sort());
	const headers = $derived(
		weekdays.map((weekday) => {
			const sample = days.find((day) => isoWeekday(day) === weekday)!;
			return { weekday, name: workspace.i18n.format(sample, { weekday: 'short' }) };
		}),
	);

	function press(event: MouseEvent, appointment: Appointment) {
		if (appointmentPress(event, selectedId === appointment.id) === 'open') handlers.open(appointment);
		else selectedId = appointment.id;
	}
</script>

<div class="overflow-hidden rounded-xl border">
	<div
		class="grid border-b text-center text-xs font-medium"
		style:grid-template-columns="repeat({weekdays.length}, minmax(0, 1fr))"
	>
		{#each headers as header (header.weekday)}
			<div class="group/head text-muted-foreground relative py-2">
				{header.name}
				{#if handlers.hideWeekday && weekdays.length > 1}
					<!-- Shown on hover and keyboard focus; always on touch screens, which cannot hover. -->
					<button
						type="button"
						class="hover:text-foreground hover:bg-accent absolute end-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md opacity-0 transition-opacity group-hover/head:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
						aria-label={workspace.t('ui.ws.calendar.hide_day', { day: header.name })}
						title={workspace.t('ui.ws.calendar.hide_day', { day: header.name })}
						onclick={() => handlers.hideWeekday?.(header.weekday)}
					>
						<EyeOff class="size-3.5" />
					</button>
				{/if}
			</div>
		{/each}
	</div>
	<div class="grid" style:grid-template-columns="repeat({weekdays.length}, minmax(0, 1fr))">
		{#each days as day (day)}
			{@const items = handlers.appointmentsOn(day)}
			<div
				class="min-h-28 border-r border-b p-1.5 text-xs {day.slice(0, 7) !== month
					? 'bg-muted/40 text-muted-foreground'
					: ''} {isoWeekday(day) >= 6 ? 'bg-muted/20' : ''}"
			>
				<button
					class="mb-1 grid size-6 place-items-center rounded-full hover:bg-muted {day === today()
						? 'bg-primary text-primary-foreground hover:bg-primary'
						: ''}"
					onclick={() => handlers.day(day)}
					aria-label={workspace.i18n.date(day)}
				>
					{Number(day.slice(8))}
				</button>
				<ul class="space-y-0.5">
					{#each items.slice(0, 3) as appointment (appointment.id)}
						<li>
							<button
								class="hover:bg-muted flex w-full items-center gap-1 truncate rounded px-1 text-left {selectedId ===
								appointment.id
									? 'ring-primary bg-muted ring-2'
									: ''}"
								aria-current={selectedId === appointment.id ? true : undefined}
								onclick={(event) => press(event, appointment)}
								onkeydown={(event) => {
									if (event.key === 'Escape' && selectedId === appointment.id) selectedId = null;
								}}
							>
								<span class="size-1.5 shrink-0 rounded-full" style:background-color={handlers.color(appointment)}
								></span>
								<span class="tabular-nums">{workspace.i18n.time(appointment.start)}</span>
								<span class="truncate">{handlers.label?.(appointment) ?? appointment.title}</span>
							</button>
						</li>
					{/each}
					{#if items.length > 3}
						<li>
							<button class="text-muted-foreground hover:text-foreground px-1" onclick={() => handlers.day(day)}>
								{workspace.t('ui.ws.calendar.more', { count: items.length - 3 })}
							</button>
						</li>
					{/if}
				</ul>
			</div>
		{/each}
	</div>
</div>
