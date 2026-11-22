<script lang="ts" module>
	import type { Appointment, CalendarDate } from '#lib/domain/types';

	export interface MonthHandlers {
		appointmentsOn(date: CalendarDate): Appointment[];
		color(appointment: Appointment): string;
		open(appointment: Appointment): void;
		day(date: CalendarDate): void;
	}
</script>

<script lang="ts">
	import { isoWeekday, today } from '#lib/domain/dates';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { days, month, handlers }: { days: CalendarDate[]; month: string; handlers: MonthHandlers } = $props();
	const workspace = useWorkspace();
	const weekdayNames = $derived(days.slice(0, 7).map((day) => workspace.i18n.format(day, { weekday: 'short' })));
</script>

<div class="overflow-hidden rounded-xl border">
	<div class="grid grid-cols-7 border-b text-center text-xs font-medium">
		{#each weekdayNames as name, index (index)}<div class="text-muted-foreground py-2">{name}</div>{/each}
	</div>
	<div class="grid grid-cols-7">
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
								class="hover:bg-muted flex w-full items-center gap-1 truncate rounded px-1 text-left"
								onclick={() => handlers.open(appointment)}
							>
								<span class="size-1.5 shrink-0 rounded-full" style:background-color={handlers.color(appointment)}
								></span>
								<span class="tabular-nums">{workspace.i18n.time(appointment.start)}</span>
								<span class="truncate">{appointment.title}</span>
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
