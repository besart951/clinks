<script lang="ts">
	import type { MemberAccess } from '#lib/data/account-api';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** When someone last signed in, and on how many devices they are signed in now. */
	let { access }: { access: MemberAccess } = $props();
	const workspace = useWorkspace();
	const dormantAfter = 30 * 86_400_000;
	const dormant = $derived(
		access.lastActiveAt !== null && Date.now() - new Date(access.lastActiveAt).getTime() > dormantAfter,
	);
</script>

{#if access.lastActiveAt}
	<p class={dormant ? 'text-amber-700 dark:text-amber-400' : ''} title={workspace.i18n.dateTime(access.lastActiveAt)}>
		{workspace.i18n.relative(access.lastActiveAt)}
		{#if dormant}<span class="sr-only">· {workspace.t('ui.ws.team.dormant')}</span>{/if}
	</p>
	<p class="text-muted-foreground text-xs">{workspace.t('ui.ws.team.devices', { count: access.devices })}</p>
{:else}
	<p class="text-muted-foreground">{workspace.t('ui.ws.team.never_signed_in')}</p>
{/if}
