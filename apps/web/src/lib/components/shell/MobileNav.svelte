<script lang="ts">
	import { page } from '$app/state';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Menu from '@lucide/svelte/icons/menu';
	import { getSidebarContext } from '@clinks/ui/components/ui/sidebar';
	import { allNavigationItems } from '#lib/features/shell/navigation-items';
	import { href, routePath } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const session = workspace.session;
	const sidebar = getSidebarContext();
	/** The places most used on a phone, in this order; a role only gets the ones it may open. */
	const preferred = ['/calendar', '/contacts', '/planner', '/visits', '/spitex', '/physio', '/mail', '/documents'];
	const items = $derived([
		{ path: '/dashboard', label: 'ui.ws.nav.dashboard', icon: LayoutDashboard },
		...preferred
			.flatMap((path) => allNavigationItems.filter((item) => item.path === path))
			.filter(
				(item) =>
					(!item.permission || session.can(item.permission)) && (!item.module || session.hasModule(item.module)),
			)
			.slice(0, 3),
	]);
</script>

<nav
	class="bg-background/95 fixed inset-x-0 bottom-0 z-20 grid auto-cols-fr grid-flow-col border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
	aria-label={workspace.t('ui.ws.shell.mobile_navigation')}
>
	{#each items as item (item.path)}
		<a
			href={href(item.path)}
			class="text-muted-foreground aria-[current=page]:text-foreground flex flex-col items-center gap-0.5 py-2 text-[11px]"
			aria-current={routePath(page.url).startsWith(item.path) ? 'page' : undefined}
		>
			<item.icon class="size-5" />
			{workspace.t(item.label)}
		</a>
	{/each}
	<button
		class="text-muted-foreground flex flex-col items-center gap-0.5 py-2 text-[11px]"
		onclick={() => sidebar.toggle()}
	>
		<Menu class="size-5" />
		{workspace.t('ui.ws.shell.more')}
	</button>
</nav>
