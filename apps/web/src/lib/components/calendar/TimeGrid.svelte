<script lang="ts" module>
	import type { UserId } from '#lib/domain/ids';
	import type { Appointment, CalendarDate } from '#lib/domain/types';

	export interface GridColumn {
		key: string;
		label: string;
		sublabel?: string;
		date: CalendarDate;
		assigneeId?: UserId | null;
		appointments: Appointment[];
		highlight?: boolean;
	}

	export interface GridHandlers {
		open(appointment: Appointment): void;
		create(date: CalendarDate, minutes: number, assigneeId: UserId | null | undefined): void;
		drop(appointment: Appointment, date: CalendarDate, minutes: number, assigneeId: UserId | null | undefined): void;
		color(appointment: Appointment): string;
		subtitle(appointment: Appointment): string;
	}
</script>

<script lang="ts">
	import { layoutDay } from '#lib/domain/layout';
	import { dayEndMinutes, dayStartMinutes } from '#lib/features/calendar/calendar.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { columns, handlers, editable }: { columns: GridColumn[]; handlers: GridHandlers; editable: boolean } = $props();
	const workspace = useWorkspace();
	const pixelsPerMinute = 0.9;
	const hours = Array.from(
		{ length: (dayEndMinutes - dayStartMinutes) / 60 },
		(_, index) => dayStartMinutes / 60 + index,
	);
	let dragging = $state<Appointment | null>(null);
	let hover = $state<{ key: string; minutes: number } | null>(null);
	const now = new Date();
	const nowMinutes = now.getHours() * 60 + now.getMinutes();

	function minutesAt(event: MouseEvent | DragEvent, element: HTMLElement) {
		const offset = event.clientY - element.getBoundingClientRect().top;
		return Math.max(
			dayStartMinutes,
			Math.min(dayEndMinutes - 15, dayStartMinutes + Math.round(offset / pixelsPerMinute / 15) * 15),
		);
	}

	function onSlotClick(event: MouseEvent, column: GridColumn) {
		if (!editable || event.target !== event.currentTarget) return;
		handlers.create(column.date, minutesAt(event, event.currentTarget as HTMLElement), column.assigneeId);
	}

	function onDragOver(event: DragEvent, column: GridColumn) {
		if (!dragging) return;
		event.preventDefault();
		hover = { key: column.key, minutes: minutesAt(event, event.currentTarget as HTMLElement) };
	}

	function onDrop(event: DragEvent, column: GridColumn) {
		event.preventDefault();
		if (dragging)
			handlers.drop(dragging, column.date, minutesAt(event, event.currentTarget as HTMLElement), column.assigneeId);
		dragging = null;
		hover = null;
	}

	function label(minutes: number) {
		return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
	}
</script>

<div class="overflow-x-auto rounded-xl border">
	<div class="grid min-w-[640px]" style:grid-template-columns="3.5rem repeat({columns.length}, minmax(7rem, 1fr))">
		<div class="bg-background sticky top-0 z-10 border-b"></div>
		{#each columns as column (column.key)}
			<div
				class="bg-background sticky top-0 z-10 border-b border-l px-2 py-2 text-center text-sm {column.highlight
					? 'text-primary font-semibold'
					: ''}"
			>
				<p class="truncate">{column.label}</p>
				{#if column.sublabel}<p class="text-muted-foreground truncate text-xs font-normal">{column.sublabel}</p>{/if}
			</div>
		{/each}
		<div class="relative" style:height="{(dayEndMinutes - dayStartMinutes) * pixelsPerMinute}px">
			{#each hours as hour (hour)}
				<span
					class="text-muted-foreground absolute right-2 -translate-y-1/2 text-[11px] tabular-nums"
					style:top="{(hour * 60 - dayStartMinutes) * pixelsPerMinute}px"
				>
					{hour > dayStartMinutes / 60 ? `${hour}:00` : ''}
				</span>
			{/each}
		</div>
		{#each columns as column (column.key)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="relative border-l {editable ? 'cursor-copy' : ''}"
				style:height="{(dayEndMinutes - dayStartMinutes) * pixelsPerMinute}px"
				style:background-image="repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent
				1px, transparent {60 * pixelsPerMinute}px)"
				role="grid"
				tabindex="-1"
				aria-label={workspace.t('ui.ws.calendar.column', { label: `${column.label} ${column.sublabel ?? ''}`.trim() })}
				onclick={(event) => onSlotClick(event, column)}
				ondragover={(event) => onDragOver(event, column)}
				ondragleave={() => (hover = null)}
				ondrop={(event) => onDrop(event, column)}
			>
				{#if column.highlight && nowMinutes > dayStartMinutes && nowMinutes < dayEndMinutes}
					<div
						class="pointer-events-none absolute inset-x-0 z-[5] h-px bg-red-500"
						style:top="{(nowMinutes - dayStartMinutes) * pixelsPerMinute}px"
					></div>
				{/if}
				{#if hover?.key === column.key && dragging}
					<div
						class="border-primary bg-primary/10 pointer-events-none absolute inset-x-1 z-[4] rounded-md border-2 border-dashed px-1 text-[11px]"
						style:top="{(hover.minutes - dayStartMinutes) * pixelsPerMinute}px"
						style:height="{((new Date(dragging.end).getTime() - new Date(dragging.start).getTime()) / 60000) *
							pixelsPerMinute}px"
					>
						{label(hover.minutes)}
					</div>
				{/if}
				{#each layoutDay(column.appointments, dayStartMinutes, dayEndMinutes) as item (item.appointment.id)}
					{@const appointment = item.appointment}
					{@const color = handlers.color(appointment)}
					<button
						type="button"
						draggable={editable}
						ondragstart={(event) => {
							dragging = appointment;
							event.dataTransfer?.setData('text/plain', appointment.id);
						}}
						ondragend={() => {
							dragging = null;
							hover = null;
						}}
						onclick={() => handlers.open(appointment)}
						class="absolute z-[3] overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-xs transition-opacity hover:z-[6] hover:shadow-md focus-visible:z-[6] {appointment.status ===
						'cancelled'
							? 'line-through opacity-50'
							: ''} {appointment.assigneeId === null ? 'border-dashed' : ''} {dragging?.id === appointment.id
							? 'opacity-40'
							: ''}"
						style:top="{item.top * pixelsPerMinute}px"
						style:height="{Math.max(item.height * pixelsPerMinute - 2, 16)}px"
						style:left="calc({(item.lane / item.lanes) * 100}% + 2px)"
						style:width="calc({100 / item.lanes}% - 4px)"
						style:border-left-color={color}
						style:background-color="color-mix(in oklab, {color} 14%, var(--background))"
						aria-label="{workspace.i18n.time(appointment.start)}–{workspace.i18n.time(
							appointment.end,
						)} {appointment.title}"
					>
						<span class="block truncate font-medium">{appointment.title}</span>
						{#if item.height >= 30}<span class="text-muted-foreground block truncate">
								{workspace.i18n.time(appointment.start)}–{workspace.i18n.time(appointment.end)}
								{handlers.subtitle(appointment)}
							</span>{/if}
					</button>
				{/each}
			</div>
		{/each}
	</div>
</div>
