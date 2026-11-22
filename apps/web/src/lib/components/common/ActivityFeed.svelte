<script lang="ts" module>
	export interface Actor {
		name: string;
		avatarColor: string;
		avatarDataUrl: string | null;
	}
</script>

<script lang="ts">
	import PersonAvatar from './PersonAvatar.svelte';
	import { auditKey, auditPath } from '#lib/features/activity/audit-text';
	import type { AuditEntry } from '@clinks/domain/types';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { entries, actors }: { entries: AuditEntry[]; actors: Map<string, Actor> } = $props();
	const workspace = useWorkspace();
	const unknown: Actor = { name: '?', avatarColor: '#71717a', avatarDataUrl: null };
</script>

<ol class="space-y-3">
	{#each entries as entry (entry.id)}
		{@const actor = actors.get(entry.actorId) ?? unknown}
		{@const path = auditPath(entry)}
		<li class="flex gap-3 text-sm">
			<PersonAvatar person={actor} size="sm" />
			<div class="min-w-0 flex-1">
				<p>
					<span class="font-medium">{actor.name}</span>
					{workspace.t(auditKey(entry), { target: entry.target.label, action: entry.action })}
				</p>
				<p class="text-muted-foreground text-xs">
					<time datetime={entry.createdAt} title={workspace.i18n.dateTime(entry.createdAt)}>
						{workspace.i18n.relative(entry.createdAt)}
					</time>
					{#if path}· <a class="hover:text-foreground underline-offset-2 hover:underline" href={href(path)}>
							{workspace.t('ui.ws.activity.open')}
						</a>{/if}
				</p>
			</div>
		</li>
	{/each}
</ol>
