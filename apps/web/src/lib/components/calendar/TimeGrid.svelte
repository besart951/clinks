<script lang="ts" module>
	import type { UserId } from '@clinks/domain/ids';
	import type { Appointment, CalendarDate } from '@clinks/domain/types';

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
		/** New start and end after dragging the top or bottom edge of an appointment. */
		resize(appointment: Appointment, times: { start: string; end: string }): void;
		color(appointment: Appointment): string;
		subtitle(appointment: Appointment): string;
	}
</script>

<script lang="ts">
	import { layoutDay } from '@clinks/domain/layout';
	import { atTime, minutesToTime } from '@clinks/domain/dates';
	import { dayEndMinutes, dayStartMinutes } from '#lib/features/calendar/calendar.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { columns, handlers, editable }: { columns: GridColumn[]; handlers: GridHandlers; editable: boolean } = $props();
	const workspace = useWorkspace();
	/** Never smaller than this, so short appointments stay readable; grows to fill the window's height. */
	const minPixelsPerMinute = 0.9;
	const range = dayEndMinutes - dayStartMinutes;
	let frame: HTMLElement;
	let header = $state(44);
	let available = $state(0);
	const pixelsPerMinute = $derived(Math.max(minPixelsPerMinute, (available - header) / range));

	/** Measures the space from the grid's top to the bottom of the window (DOM measurement only). */
	$effect(() => {
		const measure = () => {
			// Position in the document, so a scrolled page measures the same as an unscrolled one.
			const top = frame.getBoundingClientRect().top + scrollY;
			available = Math.max(0, innerHeight - top - Number(frame.dataset.reserve ?? 0));
			header = frame.querySelector<HTMLElement>('[data-grid-head]')?.offsetHeight ?? 44;
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(document.documentElement);
		addEventListener('resize', measure);
		return () => {
			observer.disconnect();
			removeEventListener('resize', measure);
		};
	});
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

	/** The appointment whose edge is being dragged, with its new times in minutes of the day. */
	let resizing = $state<{ id: string; start: number; end: number } | null>(null);
	let resize: {
		appointment: Appointment;
		column: GridColumn;
		edge: 'start' | 'end';
		element: HTMLElement;
		pointerId: number;
	} | null = null;
	let swallowClick = false;
	const step = 15;

	function minutesOf(timestamp: string) {
		const date = new Date(timestamp);
		return date.getHours() * 60 + date.getMinutes();
	}

	function snapped(event: PointerEvent, element: HTMLElement) {
		const offset = event.clientY - element.getBoundingClientRect().top;
		return dayStartMinutes + Math.round(offset / pixelsPerMinute / step) * step;
	}

	function startResize(event: PointerEvent, appointment: Appointment, column: GridColumn, edge: 'start' | 'end') {
		if (!editable || event.button !== 0) return;
		// Stops the native drag of the appointment and the click that would open it.
		event.preventDefault();
		event.stopPropagation();
		const handle = event.currentTarget as HTMLElement;
		const element = handle.closest<HTMLElement>('[data-grid-column]');
		if (!element) return;
		handle.setPointerCapture(event.pointerId);
		resize = { appointment, column, edge, element, pointerId: event.pointerId };
		resizing = { id: appointment.id, start: minutesOf(appointment.start), end: minutesOf(appointment.end) };
	}

	function moveResize(event: PointerEvent) {
		if (!resize || !resizing || event.pointerId !== resize.pointerId) return;
		const minutes = snapped(event, resize.element);
		resizing =
			resize.edge === 'start'
				? { ...resizing, start: Math.max(dayStartMinutes, Math.min(minutes, resizing.end - step)) }
				: { ...resizing, end: Math.min(dayEndMinutes, Math.max(minutes, resizing.start + step)) };
	}

	function endResize(event: PointerEvent | null, cancel = false) {
		if (!resize || (event && event.pointerId !== resize.pointerId)) return;
		const { appointment, column } = resize;
		const times = resizing;
		resize = null;
		resizing = null;
		swallowClick = true;
		setTimeout(() => (swallowClick = false), 0);
		if (cancel || !times) return;
		handlers.resize(appointment, {
			start: atTime(column.date, minutesToTime(times.start)),
			end: atTime(column.date, minutesToTime(times.end)),
		});
	}

	/** Keyboard alternative: Alt + arrows move the start, Alt + Shift + arrows the end, in 15-minute steps. */
	function onAppointmentKey(event: KeyboardEvent, appointment: Appointment, column: GridColumn) {
		if (!editable || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
		event.preventDefault();
		const delta = event.key === 'ArrowUp' ? -step : step;
		let start = minutesOf(appointment.start);
		let end = minutesOf(appointment.end);
		if (event.shiftKey) end = Math.min(dayEndMinutes, Math.max(start + step, end + delta));
		else start = Math.max(dayStartMinutes, Math.min(end - step, start + delta));
		handlers.resize(appointment, {
			start: atTime(column.date, minutesToTime(start)),
			end: atTime(column.date, minutesToTime(end)),
		});
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

<svelte:window
	onpointermove={moveResize}
	onpointerup={(event) => endResize(event)}
	onpointercancel={(event) => endResize(event, true)}
	onkeydown={(event) => event.key === 'Escape' && resize && endResize(null, true)}
/>

<!-- Reserves room below for the hint line and the page padding. -->
<div bind:this={frame} data-reserve="64" class="overflow-x-auto rounded-xl border">
	<div class="grid min-w-[640px]" style:grid-template-columns="3.5rem repeat({columns.length}, minmax(7rem, 1fr))">
		<div class="bg-background sticky top-0 z-10 border-b"></div>
		{#each columns as column (column.key)}
			<div
				data-grid-head
				class="bg-background sticky top-0 z-10 border-b border-l px-2 py-2 text-center text-sm {column.highlight
					? 'text-primary font-semibold'
					: ''}"
			>
				<p class="truncate">{column.label}</p>
				{#if column.sublabel}<p class="text-muted-foreground truncate text-xs font-normal">{column.sublabel}</p>{/if}
			</div>
		{/each}
		<div class="relative" style:height="{range * pixelsPerMinute}px">
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
				data-grid-column
				class="relative border-l {editable ? 'cursor-copy' : ''}"
				style:height="{range * pixelsPerMinute}px"
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
					{@const live = resizing?.id === appointment.id ? resizing : null}
					{@const top = live ? live.start - dayStartMinutes : item.top}
					{@const height = live ? live.end - live.start : item.height}
					<button
						type="button"
						draggable={editable && !live}
						ondragstart={(event) => {
							dragging = appointment;
							event.dataTransfer?.setData('text/plain', appointment.id);
						}}
						ondragend={() => {
							dragging = null;
							hover = null;
						}}
						onclick={() => !swallowClick && handlers.open(appointment)}
						onkeydown={(event) => onAppointmentKey(event, appointment, column)}
						aria-keyshortcuts={editable ? 'Alt+ArrowUp Alt+ArrowDown Alt+Shift+ArrowUp Alt+Shift+ArrowDown' : undefined}
						class="group/appointment absolute z-[3] overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-xs transition-opacity hover:z-[6] hover:shadow-md focus-visible:z-[6] {appointment.status ===
						'cancelled'
							? 'line-through opacity-50'
							: ''} {appointment.assigneeId === null ? 'border-dashed' : ''} {dragging?.id === appointment.id
							? 'opacity-40'
							: ''} {live ? 'z-[7] shadow-md ring-2 ring-[var(--ring)]' : ''}"
						style:top="{top * pixelsPerMinute}px"
						style:height="{Math.max(height * pixelsPerMinute - 2, 16)}px"
						style:left="calc({(item.lane / item.lanes) * 100}% + 2px)"
						style:width="calc({100 / item.lanes}% - 4px)"
						style:border-left-color={color}
						style:background-color="color-mix(in oklab, {color} 14%, var(--background))"
						aria-label="{workspace.i18n.time(appointment.start)}–{workspace.i18n.time(
							appointment.end,
						)} {appointment.title}"
					>
						<span class="block truncate font-medium">{appointment.title}</span>
						{#if live}
							<span class="block truncate font-medium tabular-nums">{label(live.start)}–{label(live.end)}</span>
						{:else if item.height >= 30}<span class="text-muted-foreground block truncate">
								{workspace.i18n.time(appointment.start)}–{workspace.i18n.time(appointment.end)}
								{handlers.subtitle(appointment)}
							</span>{/if}
						{#if editable && appointment.status !== 'cancelled'}
							{#each ['start', 'end'] as const as edge (edge)}
								<span
									aria-hidden="true"
									class="handle absolute inset-x-0 flex h-2 cursor-ns-resize touch-none justify-center opacity-0 group-hover/appointment:opacity-100 group-focus-visible/appointment:opacity-100 [@media(hover:none)]:opacity-100 {edge ===
									'start'
										? 'top-0'
										: 'bottom-0'} {live ? 'opacity-100' : ''}"
									onpointerdown={(event) => startResize(event, appointment, column, edge)}
								>
									<span class="mt-0.5 h-1 w-6 rounded-full bg-current opacity-40"></span>
								</span>
							{/each}
						{/if}
					</button>
				{/each}
			</div>
		{/each}
	</div>
</div>
