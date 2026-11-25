<script lang="ts" module>
	export type JumpUnit = 'day' | 'week' | 'month' | 'year';
</script>

<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import * as Popover from '@clinks/ui/components/ui/popover';
	import { Button } from '@clinks/ui/components/ui/button';
	import { addMonths, isoWeek, monthGrid, startOfMonth, startOfWeek, today } from '@clinks/domain/dates';
	import type { CalendarDate } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	/**
	 * A calendar icon that opens a small calendar to jump to a day, week, month or year. `units` are the picks the
	 * page can show; a year always leads on to its months, and a month to its days when months are not in `units`.
	 */
	let {
		value,
		units,
		initial = 'day',
		label,
		onpick,
	}: {
		value: CalendarDate;
		units: Exclude<JumpUnit, 'year'>[];
		initial?: JumpUnit;
		/** Shown on the trigger, e.g. the date on show; without it the trigger is an icon. */
		label?: string;
		onpick: (unit: Exclude<JumpUnit, 'year'>, date: CalendarDate) => void;
	} = $props();

	const workspace = useWorkspace();
	let open = $state(false);
	let mode = $state<JumpUnit>('day');
	/** The month (day and week mode) or year (month and year mode) on show. */
	let cursor = $state<CalendarDate>(today());
	let focusIndex = $state(0);
	let content = $state<HTMLElement | null>(null);

	const modes: JumpUnit[] = ['day', 'week', 'month', 'year'];
	const year = $derived(Number(cursor.slice(0, 4)));
	const firstYear = $derived(year - (year % 12));

	type Cell = { key: string; label: string; date: CalendarDate; selected: boolean; current: boolean; muted: boolean };

	const cells = $derived.by((): Cell[] => {
		const now = today();
		if (mode === 'day')
			return monthGrid(cursor).map((date) => ({
				key: date,
				label: String(Number(date.slice(8))),
				date,
				selected: date === value,
				current: date === now,
				muted: date.slice(0, 7) !== cursor.slice(0, 7),
			}));
		if (mode === 'week')
			return Array.from({ length: 6 }, (_, row) => {
				const date = monthGrid(cursor)[row * 7];
				return {
					key: date,
					label: String(isoWeek(date)),
					date,
					selected: date === startOfWeek(value),
					current: date === startOfWeek(now),
					muted: false,
				};
			});
		if (mode === 'month')
			return Array.from({ length: 12 }, (_, index) => {
				const date = `${year}-${String(index + 1).padStart(2, '0')}-01`;
				return {
					key: date,
					label: workspace.i18n.format(date, { month: 'short' }),
					date,
					selected: date === startOfMonth(value),
					current: date === startOfMonth(now),
					muted: false,
				};
			});
		return Array.from({ length: 12 }, (_, index) => {
			const date = `${firstYear + index}-01-01`;
			return {
				key: date,
				label: String(firstYear + index),
				date,
				selected: date.slice(0, 4) === value.slice(0, 4),
				current: date.slice(0, 4) === now.slice(0, 4),
				muted: false,
			};
		});
	});

	const columns = $derived(mode === 'day' ? 7 : mode === 'week' ? 1 : 3);
	const weekdayNames = $derived(
		monthGrid(cursor)
			.slice(0, 7)
			.map((date) => workspace.i18n.format(date, { weekday: 'narrow' })),
	);
	const title = $derived(
		mode === 'day' || mode === 'week'
			? workspace.i18n.format(cursor, { month: 'long', year: 'numeric' })
			: mode === 'month'
				? String(year)
				: `${firstYear} – ${firstYear + 11}`,
	);

	function show(next: JumpUnit, at: CalendarDate) {
		mode = next;
		cursor = at;
		const index = cells.findIndex((cell) => cell.selected);
		focusIndex =
			index >= 0
				? index
				: Math.max(
						0,
						cells.findIndex((cell) => cell.current),
					);
	}

	function opened(isOpen: boolean) {
		if (isOpen) show(initial, value);
	}

	function step(direction: -1 | 1) {
		if (mode === 'day' || mode === 'week') cursor = addMonths(cursor, direction);
		else cursor = `${year + direction * (mode === 'month' ? 1 : 12)}-01-01`;
		focusIndex = Math.min(focusIndex, cells.length - 1);
	}

	/** Title click zooms out: days → months → years. */
	function zoomOut() {
		if (mode === 'day' || mode === 'week') show('month', `${year}-01-01`);
		else if (mode === 'month') show('year', cursor);
	}

	function pick(cell: Cell) {
		if (mode === 'year') return show('month', cell.date);
		if (mode === 'month' && !units.includes('month')) return show(units.includes('day') ? 'day' : 'week', cell.date);
		onpick(mode as Exclude<JumpUnit, 'year'>, cell.date);
		open = false;
	}

	/** Arrow keys move through the grid; only the focused cell is in the tab order. */
	function keydown(event: KeyboardEvent) {
		const moves: Record<string, number> = {
			ArrowLeft: -1,
			ArrowRight: 1,
			ArrowUp: -columns,
			ArrowDown: columns,
			Home: -focusIndex,
			End: cells.length - 1 - focusIndex,
		};
		const move = moves[event.key];
		if (move === undefined) return;
		event.preventDefault();
		focusIndex = Math.min(cells.length - 1, Math.max(0, focusIndex + move));
		content?.querySelector<HTMLElement>(`[data-cell="${focusIndex}"]`)?.focus();
	}

	const unitLabel = (unit: JumpUnit) =>
		workspace.t(unit === 'year' ? 'ui.ws.calendar.view_year' : `ui.ws.calendar.view_${unit}`);
</script>

<Popover.Root bind:open onOpenChange={opened}>
	<Popover.Trigger>
		{#snippet child({ props })}
			{#if label}
				<Button
					{...props}
					variant="ghost"
					class="h-10 min-w-0 gap-2 px-2 text-base font-semibold capitalize"
					title={workspace.t('ui.ws.calendar.jump')}
				>
					<CalendarDays class="size-4 shrink-0" />
					<span class="truncate" aria-live="polite">{label}</span>
					<ChevronDown class="text-muted-foreground size-4 shrink-0" />
					<span class="sr-only">– {workspace.t('ui.ws.calendar.jump')}</span>
				</Button>
			{:else}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label={workspace.t('ui.ws.calendar.jump')}
					title={workspace.t('ui.ws.calendar.jump')}
				>
					<CalendarDays class="size-4" />
				</Button>
			{/if}
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		align="start"
		class="w-72"
		role="dialog"
		aria-label={workspace.t('ui.ws.calendar.jump')}
		bind:ref={content}
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			content?.querySelector<HTMLElement>(`[data-cell="${focusIndex}"]`)?.focus();
		}}
	>
		<div class="bg-muted grid grid-cols-4 gap-0.5 rounded-md p-0.5">
			{#each modes as unit (unit)}
				<button
					type="button"
					class="rounded px-2 py-1 text-xs font-medium transition-colors {mode === unit
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={mode === unit}
					onclick={() => show(unit, unit === 'year' || unit === 'month' ? `${year}-01-01` : cursor)}
				>
					{unitLabel(unit)}
				</button>
			{/each}
		</div>

		<div class="flex items-center justify-between">
			<Button
				variant="ghost"
				size="icon-sm"
				onclick={() => step(-1)}
				aria-label={workspace.t('ui.ws.calendar.previous')}
			>
				<ChevronLeft class="size-4" />
			</Button>
			<button
				type="button"
				class="hover:bg-accent rounded-md px-2 py-1 text-sm font-semibold capitalize disabled:hover:bg-transparent"
				aria-live="polite"
				disabled={mode === 'year'}
				onclick={zoomOut}
			>
				{title}
			</button>
			<Button variant="ghost" size="icon-sm" onclick={() => step(1)} aria-label={workspace.t('ui.ws.calendar.next')}>
				<ChevronRight class="size-4" />
			</Button>
		</div>

		{#if mode === 'day' || mode === 'week'}
			<div
				class="text-muted-foreground grid text-center text-[11px] {mode === 'week' ? 'grid-cols-8' : 'grid-cols-7'}"
				aria-hidden="true"
			>
				{#if mode === 'week'}<span>{workspace.t('ui.ws.calendar.week_short')}</span>{/if}
				{#each weekdayNames as name, index (index)}<span>{name}</span>{/each}
			</div>
		{/if}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="grid gap-0.5" style:grid-template-columns="repeat({columns}, minmax(0, 1fr))" onkeydown={keydown}>
			{#each cells as cell, index (cell.key)}
				<button
					type="button"
					data-cell={index}
					tabindex={index === focusIndex ? 0 : -1}
					aria-pressed={cell.selected}
					aria-current={cell.current ? 'date' : undefined}
					aria-label={mode === 'week'
						? workspace.t('ui.ws.calendar.week_of', {
								week: cell.label,
								from: workspace.i18n.format(cell.date, { day: 'numeric', month: 'short' }),
							})
						: mode === 'day'
							? workspace.i18n.format(cell.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
							: mode === 'month'
								? workspace.i18n.format(cell.date, { month: 'long', year: 'numeric' })
								: undefined}
					class="rounded-md text-sm tabular-nums transition-colors focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 {cell.selected
						? 'bg-primary text-primary-foreground'
						: 'hover:bg-accent'} {cell.current && !cell.selected ? 'text-primary font-semibold' : ''} {cell.muted &&
					!cell.selected
						? 'text-muted-foreground/60'
						: ''} {mode === 'day' ? 'h-8' : mode === 'week' ? 'grid h-8 grid-cols-8 items-center' : 'h-10'}"
					onclick={() => pick(cell)}
					onfocus={() => (focusIndex = index)}
				>
					{#if mode === 'week'}
						<span class="text-muted-foreground text-[11px] {cell.selected ? 'text-primary-foreground/80' : ''}">
							{cell.label}
						</span>
						{#each Array.from({ length: 7 }, (_, offset) => monthGrid(cursor)[index * 7 + offset]) as day (day)}
							<span class={day.slice(0, 7) !== cursor.slice(0, 7) && !cell.selected ? 'text-muted-foreground/60' : ''}>
								{Number(day.slice(8))}
							</span>
						{/each}
					{:else}
						{cell.label}
					{/if}
				</button>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>
