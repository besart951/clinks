<script lang="ts">
	import { roleGrants } from '@clinks/domain/permissions';
	import type { Permission, Role } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** How far a role reaches in one area: edit (or allowed, for a right of its own), view, or nothing. */
	let {
		role,
		area,
	}: { role: Pick<Role, 'permissions' | 'kind'>; area: { read: Permission | null; write: Permission | null } } =
		$props();
	const workspace = useWorkspace();
</script>

{#if area.write && roleGrants(role, area.write)}<span
		class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-300"
	>
		{workspace.t(area.read ? 'ui.ws.roles.write' : 'ui.ws.roles.allowed')}
	</span>{:else if area.read && roleGrants(role, area.read)}<span
		class="rounded bg-sky-500/10 px-1.5 py-0.5 text-xs text-sky-700 dark:text-sky-300"
	>
		{workspace.t('ui.ws.roles.read')}
	</span>{:else}<span class="text-muted-foreground text-xs" aria-label={workspace.t('ui.ws.roles.none')}>–</span>{/if}
