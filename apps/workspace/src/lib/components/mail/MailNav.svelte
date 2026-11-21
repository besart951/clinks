<script lang="ts">
	import { page } from '$app/state';
	import { href, routePath } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const links = [
		{ path: '/mail', label: 'ui.ws.mail.mailbox' },
		{ path: '/mail/campaigns', label: 'ui.ws.campaign.title' },
		{ path: '/mail/templates', label: 'ui.ws.mail.templates' },
	];
	const current = $derived(routePath(page.url));
</script>

<nav class="bg-muted mb-4 inline-flex rounded-lg p-0.5 text-sm" aria-label={workspace.t('ui.ws.module.mail')}>
	{#each links as link (link.path)}
		{@const active = link.path === '/mail' ? current === '/mail' : current.startsWith(link.path)}
		<a href={href(link.path)} class="rounded-md px-3 py-1 {active ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}" aria-current={active ? 'page' : undefined}>{workspace.t(link.label)}</a>
	{/each}
</nav>
