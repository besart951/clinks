<script lang="ts">
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Send from '@lucide/svelte/icons/send';
	import { Button } from '@clinks/ui/components/ui/button';
	import ConfirmDialog, { type ConfirmRequest } from '#lib/components/common/ConfirmDialog.svelte';
	import type { PlanningModel } from '#lib/features/spitex/planning.svelte';
	import type { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { isoWeek, toCalendarDate } from '@clinks/domain/dates';
	import { useWorkspace } from '#lib/workspace.svelte';

	/**
	 * The week's release: «status» shows whether staff see the plan yet,
	 * «actions» lets a planner release it or take the release back.
	 */
	let { model, people, part }: { model: PlanningModel; people: PeopleDirectory; part: 'status' | 'actions' } = $props();
	const workspace = useWorkspace();
	const week = $derived(isoWeek(model.date));
	const canRelease = $derived(workspace.session.can('spitex.release'));
	let confirm = $state<ConfirmRequest | null>(null);
	const hint = $derived(
		model.release
			? workspace.t('ui.ws.spitex.release.status_released_hint', {
					date: workspace.i18n.format(toCalendarDate(model.release.createdAt), { day: 'numeric', month: 'long' }),
					name: people.get(model.release.releasedBy)?.name ?? '–',
				})
			: workspace.t('ui.ws.spitex.release.status_draft_hint'),
	);

	function askRelease() {
		const { visits, people: count, open } = model.weekSummary;
		confirm = {
			title: workspace.t('ui.ws.spitex.release.release_title', { week }),
			description: workspace.t(
				open > 0 ? 'ui.ws.spitex.release.release_text_open' : 'ui.ws.spitex.release.release_text',
				{ visits, people: count, open },
			),
			confirmLabel: workspace.t('ui.ws.spitex.release.release'),
			onConfirm: () => model.releaseWeek(week),
		};
	}

	function askWithdraw() {
		confirm = {
			title: workspace.t('ui.ws.spitex.release.withdraw_title', { week }),
			description: workspace.t('ui.ws.spitex.release.withdraw_text'),
			confirmLabel: workspace.t('ui.ws.spitex.release.withdraw'),
			destructive: true,
			onConfirm: () => model.withdrawRelease(week),
		};
	}
</script>

{#if model.resource.data}
	{#if part === 'status'}
		<!-- Text and icon carry the state, not the colour alone; a change is announced. -->
		<span
			role="status"
			class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium {model.release
				? 'border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
				: 'border-amber-600/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'}"
			title={hint}
		>
			{#if model.release}<CircleCheck class="size-3.5" />{:else}<EyeOff class="size-3.5" />{/if}
			{workspace.t('ui.ws.spitex.release.week', { week })} ·
			{workspace.t(model.release ? 'ui.ws.spitex.release.status_released' : 'ui.ws.spitex.release.status_draft')}
			<span class="sr-only">{hint}</span>
		</span>
	{:else if canRelease}
		{#if model.release}
			<Button variant="outline" onclick={askWithdraw}>
				<EyeOff class="size-4" />{workspace.t('ui.ws.spitex.release.withdraw')}
			</Button>
		{:else}
			<Button onclick={askRelease}>
				<Send class="size-4" />{workspace.t('ui.ws.spitex.release.release')}
			</Button>
		{/if}
		<ConfirmDialog bind:request={confirm} />
	{/if}
{/if}
