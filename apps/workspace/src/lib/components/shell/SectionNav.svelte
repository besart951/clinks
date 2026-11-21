<script lang="ts">
	import { page } from '$app/state';
	import { href, routePath } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	let { label, links }: { label: string; links: { path: string; label: string; exact?: boolean; match?: string }[] } = $props();
	const workspace = useWorkspace();
	const current = $derived(routePath(page.url));
</script>

<nav class="bg-muted mb-4 inline-flex max-w-full overflow-x-auto rounded-lg p-0.5 text-sm" aria-label={label}>
	{#each links as link (link.path)}
		{@const active = (link.exact ? current === link.path : current === link.path || current.startsWith(`${link.path}/`)) || (link.match !== undefined && current.startsWith(link.match))}
		<a href={href(link.path)} class="shrink-0 rounded-md px-3 py-1 {active ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}" aria-current={active ? 'page' : undefined}>{workspace.t(link.label)}</a>
	{/each}
</nav>
