<script lang="ts">
	import { auditKey } from '#lib/features/activity/audit-text';
	import type { TeamModel } from '#lib/features/settings/team.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** The last changes to the team: who invited, changed a role, signed out or deactivated whom. */
	let { model }: { model: TeamModel } = $props();
	const workspace = useWorkspace();
	const people = new PeopleDirectory(workspace);
</script>

{#if model.recent.length > 0}
	<section class="mb-6" aria-labelledby="team-history">
		<div class="mb-2 flex items-baseline justify-between gap-3">
			<h2 id="team-history" class="font-semibold">{workspace.t('ui.ws.team.recent')}</h2>
			<a class="text-muted-foreground text-sm hover:underline" href={href('/activity')}>
				{workspace.t('ui.ws.team.recent_all')}
			</a>
		</div>
		<ol class="space-y-2 text-sm">
			{#each model.recent as entry (entry.id)}
				<li class="flex flex-wrap gap-x-3">
					<span class="text-muted-foreground w-32 shrink-0 tabular-nums">
						{workspace.i18n.dateTime(entry.createdAt)}
					</span>
					<span>
						<span class="font-medium">{people.get(entry.actorId)?.name ?? '–'}</span>
						{workspace.t(auditKey(entry), { target: model.targetName(entry), action: entry.action })}
					</span>
				</li>
			{/each}
		</ol>
	</section>
{/if}
