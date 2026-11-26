<script lang="ts">
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Checkbox } from '@clinks/ui/components/ui/checkbox';
	import type { Member } from '#lib/data/account-api';
	import type { TeamModel } from '#lib/features/settings/team.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Before someone leaves: what happens to the visits they still have ahead. */
	let { model, member = $bindable(null) }: { model: TeamModel; member: Member | null } = $props();
	const workspace = useWorkspace();
	const shown = 4;
	let release = $state(true);
	let busy = $state(false);
	const visits = $derived(member ? model.futureVisits(member) : []);
	const name = $derived(member ? `${member.user.firstName} ${member.user.lastName}` : '');

	async function confirm() {
		if (!member) return;
		busy = true;
		try {
			await model.deactivate(member.membership.id, visits.length > 0 && release);
		} finally {
			busy = false;
			member = null;
		}
	}
</script>

<Dialog.Root
	open={member !== null}
	onOpenChange={(open) => {
		if (!open) member = null;
		else release = true;
	}}
>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} showCloseButton={false} class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{workspace.t('ui.ws.team.deactivate_title', { name })}</Dialog.Title>
			<Dialog.Description>{workspace.t('ui.ws.team.deactivate_text')}</Dialog.Description>
		</Dialog.Header>
		{#if visits.length > 0}
			<section class="rounded-lg border p-3" aria-labelledby="future-visits">
				<h3 id="future-visits" class="text-sm font-medium">
					{workspace.t('ui.ws.team.future_visits', { count: visits.length })}
				</h3>
				<ul class="text-muted-foreground mt-2 space-y-1 text-sm">
					{#each visits.slice(0, shown) as visit (visit.id)}
						<li class="flex gap-3">
							<span class="w-32 shrink-0 tabular-nums">{workspace.i18n.dateTime(visit.start)}</span>
							<span class="text-foreground truncate">{visit.title}</span>
						</li>
					{/each}
					{#if visits.length > shown}
						<li>{workspace.t('ui.ws.team.future_visits_more', { count: visits.length - shown })}</li>
					{/if}
				</ul>
				<label class="mt-3 flex items-start gap-2 text-sm">
					<Checkbox bind:checked={release} class="mt-0.5" />
					<span>
						{workspace.t('ui.ws.team.release_visits')}
						<span class="text-muted-foreground block text-xs">{workspace.t('ui.ws.team.release_visits_hint')}</span>
					</span>
				</label>
			</section>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" autofocus onclick={() => (member = null)}>{workspace.t('ui.ws.cancel')}</Button>
			<Button variant="destructive" disabled={busy} onclick={confirm}>{workspace.t('ui.ws.team.deactivate')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
