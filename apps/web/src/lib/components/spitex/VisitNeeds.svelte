<script lang="ts">
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import { addDays, isoWeekday, today } from '@clinks/domain/dates';
	import { visitNeedDays } from '@clinks/domain/visit-needs';
	import type { ContactId } from '@clinks/domain/ids';
	import type { VisitNeed } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { contactId, needs }: { contactId: ContactId; needs: VisitNeed[] } = $props();
	const workspace = useWorkspace();
	const weekdays = [1, 2, 3, 4, 5, 6, 7];
	const dayLabel = (day: number) => workspace.i18n.format(new Date(2024, 0, day, 12), { weekday: 'short' });
	let editing = $state(false);
	let existing = $state.raw<VisitNeed | null>(null);
	let busy = $state(false);
	function initial(need: VisitNeed | null) {
		const startsOn = need && need.endsOn >= today() ? addDays(need.endsOn, 1) : today();
		return {
			title: need?.title ?? '',
			notes: need?.notes ?? '',
			startsOn,
			endsOn: addDays(startsOn, 6),
			weekdays: need ? [...need.weekdays] : [isoWeekday(startsOn)],
			startTime: need?.startTime ?? '09:00',
			durationMinutes: need?.durationMinutes ?? 30,
			from: need?.arrivalWindow?.from ?? '',
			to: need?.arrivalWindow?.to ?? '',
		};
	}
	let draft = $state(initial(null));
	const count = $derived(visitNeedDays(draft).length);
	function start(need: VisitNeed | null) {
		existing = need;
		draft = initial(need);
		editing = true;
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !count) return;
		const { from, to, ...period } = $state.snapshot(draft);
		const fields = {
			...period,
			title: period.title.trim(),
			contactId,
			arrivalWindow: from && to ? { from, to } : null,
		};
		busy = true;
		try {
			const saved = await workspace.run(() =>
				existing
					? workspace.api.visitNeeds.update(existing.id, existing.revision, fields)
					: workspace.api.visitNeeds.create(fields),
			);
			if (saved) editing = false;
		} finally {
			busy = false;
		}
	}
</script>

<section class="mb-5 min-w-0 space-y-3 rounded-xl border p-4" aria-labelledby="visit-needs-title">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 id="visit-needs-title" class="font-heading font-medium">{workspace.t('ui.ws.spitex.needs')}</h2>
		{#if workspace.session.can('spitex.write') && !editing}<Button
				size="sm"
				variant="outline"
				onclick={() => start(null)}
			>
				{workspace.t('ui.ws.spitex.create_need')}
			</Button>{/if}
	</div>
	{#each needs as need (need.id)}
		<div class="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
			<div class="min-w-0 [overflow-wrap:anywhere]">
				<b>{need.title}</b>
				<p class="text-muted-foreground text-sm">
					{need.weekdays.map(dayLabel).join(', ')} · {need.startTime} · {need.durationMinutes} min · {workspace.t(
						'ui.ws.spitex.through',
						{ date: workspace.i18n.date(need.endsOn) },
					)}
				</p>
			</div>
			{#if workspace.session.can('spitex.write') && !editing}<Button
					size="sm"
					variant="ghost"
					onclick={() => start(need)}
				>
					{workspace.t('ui.ws.spitex.continue_need')}
				</Button>{/if}
		</div>
	{/each}
	{#if editing}
		<form class="grid min-w-0 gap-3" onsubmit={save}>
			<label>{workspace.t('ui.ws.spitex.activity')}<Input required maxlength={200} bind:value={draft.title} /></label>
			<label>{workspace.t('ui.ws.field.notes')}<Textarea maxlength={4000} bind:value={draft.notes} /></label>
			<div class="grid min-w-0 gap-3 sm:grid-cols-2">
				<label class="min-w-0">
					{workspace.t('ui.ws.spitex.starts_on')}<Input
						type="date"
						required
						min={existing ? addDays(existing.endsOn, 1) : undefined}
						bind:value={draft.startsOn}
					/>
				</label>
				<label class="min-w-0">
					{workspace.t('ui.ws.spitex.ends_on')}<Input
						type="date"
						required
						min={draft.startsOn}
						max={draft.startsOn ? addDays(draft.startsOn, 92) : undefined}
						bind:value={draft.endsOn}
					/>
				</label>
			</div>
			<fieldset>
				<legend>{workspace.t('ui.ws.spitex.days')}</legend>
				<div class="flex flex-wrap gap-2">
					{#each weekdays as day (day)}<label class="inline-flex min-h-10 items-center gap-1">
							<input type="checkbox" bind:group={draft.weekdays} value={day} />{dayLabel(day)}
						</label>{/each}
				</div>
			</fieldset>
			<div class="grid gap-3 sm:grid-cols-2">
				<label>{workspace.t('ui.ws.spitex.time')}<Input required type="time" bind:value={draft.startTime} /></label>
				<label>
					{workspace.t('ui.ws.spitex.duration')}<Input
						required
						type="number"
						min={1}
						max={1440}
						bind:value={draft.durationMinutes}
					/>
				</label>
				<label>
					{workspace.t('ui.ws.spitex.window_from')}<Input
						type="time"
						max={draft.startTime}
						required={!!draft.to}
						bind:value={draft.from}
					/>
				</label>
				<label>
					{workspace.t('ui.ws.spitex.window_to')}<Input
						type="time"
						min={draft.startTime}
						required={!!draft.from}
						bind:value={draft.to}
					/>
				</label>
			</div>
			<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.spitex.period_limit')}</p>
			<div class="flex flex-wrap gap-2">
				<Button type="submit" disabled={busy || !count || !draft.title.trim()}>
					{workspace.t('ui.ws.spitex.plan_count', { count })}
				</Button>
				<Button variant="ghost" disabled={busy} onclick={() => (editing = false)}>{workspace.t('ui.ws.cancel')}</Button>
			</div>
		</form>{/if}
</section>
