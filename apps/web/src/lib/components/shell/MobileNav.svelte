<script lang="ts">
	import { page } from '$app/state';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Users from '@lucide/svelte/icons/users';
	import SquareKanban from '@lucide/svelte/icons/square-kanban';
	import Menu from '@lucide/svelte/icons/menu';
	import { getSidebarContext } from '@clinks/ui-shared/components/ui/sidebar';
	import { href, routePath } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const sidebar = getSidebarContext();
	const items = [
		{ path: '/dashboard', label: 'ui.ws.nav.dashboard', icon: LayoutDashboard },
		{ path: '/calendar', label: 'ui.ws.module.calendar', icon: CalendarDays },
		{ path: '/contacts', label: 'ui.ws.module.contacts', icon: Users },
		{ path: '/planner', label: 'ui.ws.module.planner', icon: SquareKanban },
	];
</script>

<nav
	class="bg-background/95 fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
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
