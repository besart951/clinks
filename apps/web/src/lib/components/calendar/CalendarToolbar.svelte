<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Eye from '@lucide/svelte/icons/eye';
	import CalendarCog from '@lucide/svelte/icons/calendar-cog';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import { Button } from '@clinks/ui/components/ui/button';
	import { addDays, isoWeek, startOfWeek, today } from '@clinks/domain/dates';
	import type { CalendarPeriod } from '#lib/features/calendar/calendar-period.svelte';
	import type { AxisSetting } from '#lib/features/calendar/axis.svelte';
	import AxisToggle from './AxisToggle.svelte';
	import DateJump from './DateJump.svelte';
	import PeriodNav from './PeriodNav.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/**
	 * The toolbar every calendar view shares: «Heute», back and forth, the small calendar to jump, the period as a
	 * title, the weekdays to leave out and, for time grids, the axis. On phones: a period switcher with big targets.
	 * `status` follows the title (e.g. the release of a week); `actions` sit at the end (filters, view tabs).
	 */
	let {
		period,
		axis,
		status,
		actions,
	}: { period: CalendarPeriod; axis?: AxisSetting; status?: Snippet; actions?: Snippet } = $props();
	const workspace = useWorkspace();
	const format = (day: string, options: Intl.DateTimeFormatOptions) => workspace.i18n.format(day, options);

	const title = $derived.by(() => {
		const [from, to] = period.range;
		if (period.unit === 'month') return format(period.anchor, { month: 'long', year: 'numeric' });
		if (period.unit === 'week')
			return `${workspace.t('ui.ws.spitex.release.week', { week: isoWeek(from) })} · ${format(from, { day: 'numeric', month: 'short' })} – ${format(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
		return format(period.anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
	});

	/** Short enough for one line on a phone. */
	const shortTitle = $derived(
		period.unit === 'month'
			? format(period.anchor, { month: 'long', year: 'numeric' })
			: period.unit === 'week'
				? `${format(period.anchor, { month: 'short', year: 'numeric' })} · ${workspace.t('ui.ws.spitex.release.week', { week: isoWeek(period.anchor) })}`
				: format(period.anchor, { weekday: 'short', day: 'numeric', month: 'long' }),
	);

	/** Monday … Sunday of any week, for the weekday names. */
	const weekdays = $derived(
		Array.from({ length: 7 }, (_, index) => ({
			weekday: index + 1,
			name: format(addDays(startOfWeek(today()), index), { weekday: 'long' }),
			short: format(addDays(startOfWeek(today()), index), { weekday: 'short' }),
		})),
	);
	const hiddenNames = $derived(
		weekdays
			.filter((day) => period.hiddenWeekdays.includes(day.weekday))
			.map((day) => day.short)
			.join(', '),
	);
</script>

{#snippet showHidden(extra = '')}
	{#if period.hiddenWeekdays.length > 0}
		<Button
			variant="ghost"
			size="sm"
			class="text-muted-foreground {extra}"
			title={workspace.t('ui.ws.calendar.show_days')}
			onclick={() => period.showAllWeekdays()}
		>
			<Eye class="size-4" />{workspace.t('ui.ws.calendar.hidden_days', { days: hiddenNames })}
		</Button>
	{/if}
{/snippet}

{#snippet weekdayMenu()}
	{#if period.weekdaysHideable}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						aria-label={workspace.t('ui.ws.calendar.weekdays')}
						title={workspace.t('ui.ws.calendar.weekdays')}
					>
						<CalendarCog class="size-4" />
					</Button>{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-52">
				<DropdownMenu.Label>{workspace.t('ui.ws.calendar.weekdays')}</DropdownMenu.Label>
				{#each weekdays as day (day.weekday)}
					<DropdownMenu.CheckboxItem
						checked={!period.hiddenWeekdays.includes(day.weekday)}
						disabled={!period.hiddenWeekdays.includes(day.weekday) && period.hiddenWeekdays.length >= 6}
						onCheckedChange={() => period.toggleWeekday(day.weekday)}
						closeOnSelect={false}
					>
						{day.name}
					</DropdownMenu.CheckboxItem>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
{/snippet}

<!-- Phones: the period to tap in the middle, today and hidden days below. -->
<div class="mb-3 space-y-3 md:hidden print:hidden">
	<PeriodNav
		value={period.anchor}
		label={shortTitle}
		units={[...period.jumps]}
		initial={period.unit}
		onstep={(direction) => period.go(direction)}
		onpick={(unit, date) => period.pick(unit, date)}
	/>
	<div class="flex flex-wrap items-center gap-2">
		{#if !period.showsToday}
			<Button variant="ghost" size="sm" onclick={() => period.go(0)}>
				<LocateFixed class="size-4" />{workspace.t('ui.ws.calendar.today')}
			</Button>
		{/if}
		{@render status?.()}
		<div class="ms-auto flex items-center gap-1">
			{@render showHidden()}
			{@render weekdayMenu()}
			{@render actions?.()}
		</div>
	</div>
</div>

<div class="mb-4 hidden flex-wrap items-center gap-2 md:flex print:hidden">
	<Button variant="outline" size="sm" onclick={() => period.go(0)}>{workspace.t('ui.ws.calendar.today')}</Button>
	<div class="flex">
		<Button
			variant="ghost"
			size="icon-sm"
			onclick={() => period.go(-1)}
			aria-label={workspace.t('ui.ws.calendar.previous')}
		>
			<ChevronLeft class="size-4" />
		</Button>
		<Button variant="ghost" size="icon-sm" onclick={() => period.go(1)} aria-label={workspace.t('ui.ws.calendar.next')}>
			<ChevronRight class="size-4" />
		</Button>
	</div>
	<DateJump
		value={period.anchor}
		units={[...period.jumps]}
		initial={period.unit}
		onpick={(unit, date) => period.pick(unit, date)}
	/>
	<h2 class="min-w-0 text-base font-semibold capitalize" aria-live="polite">{title}</h2>
	{@render status?.()}
	<div class="flex-1"></div>
	{@render showHidden()}
	{@render weekdayMenu()}
	{@render actions?.()}
	{#if axis}<AxisToggle axis={axis.value} onchange={(next) => axis.set(next)} />{/if}
</div>
