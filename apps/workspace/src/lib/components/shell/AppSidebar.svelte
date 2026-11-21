<script lang="ts">
	import { page } from '$app/state';
	import Lock from '@lucide/svelte/icons/lock';
	import Link2 from '@lucide/svelte/icons/link-2';
	import { Sidebar, SidebarContent, getSidebarContext } from '@clinks/ui-shared/components/ui/sidebar';
	import { navigationGroups, type NavigationItem } from '$lib/features/shell/navigation-items';
	import { href, routePath } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const sidebar = getSidebarContext();
	const session = workspace.session;
	const collapsed = $derived(!sidebar.open && !sidebar.mobile);

	const groups = $derived(
		navigationGroups
			.map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || session.can(item.permission)) }))
			.filter((group) => group.items.length > 0),
	);

	function locked(item: NavigationItem) {
		return item.module !== undefined && !session.hasModule(item.module);
	}

	function active(item: NavigationItem) {
		const path = routePath(page.url);
		return path === item.path || path.startsWith(`${item.path}/`);
	}

	function target(item: NavigationItem) {
		return locked(item) ? `/settings/billing?module=${item.module}` : item.path;
	}

	function closeOnMobile() {
		if (sidebar.mobile) sidebar.close();
	}
</script>

{#if sidebar.mobile && sidebar.open}
	<button class="fixed inset-0 z-20 bg-black/40 md:hidden" aria-label={workspace.t('ui.ws.shell.close_menu')} onclick={() => sidebar.close()}></button>
{/if}

<Sidebar>
	<div class="flex h-14 shrink-0 items-center gap-2 border-b px-3">
		<span
			class="grid size-8 shrink-0 place-items-center rounded-lg text-white"
			style:background-color={session.tenant?.brandColor ?? '#18181b'}
		>
			{#if session.tenant?.logoDataUrl}
				<img src={session.tenant.logoDataUrl} alt="" class="size-8 rounded-lg object-cover" />
			{:else}
				<Link2 class="size-4" />
			{/if}
		</span>
		{#if !collapsed}<span class="truncate text-sm font-semibold">{session.tenant?.name ?? 'CLinks'}</span>{/if}
	</div>
	<SidebarContent>
		<nav aria-label={workspace.t('ui.ws.shell.main_navigation')} class="space-y-4">
			{#each groups as group (group.label)}
				<div class="space-y-1">
					{#if !collapsed}
						<p class="text-muted-foreground px-2 text-[11px] font-medium tracking-wide uppercase">{workspace.t(group.label)}</p>
					{/if}
					{#each group.items as item (item.path)}
						<a
							href={href(target(item))}
							onclick={closeOnMobile}
							aria-current={active(item) ? 'page' : undefined}
							title={collapsed ? workspace.t(item.label) : undefined}
							class="hover:bg-sidebar-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors aria-[current=page]:bg-sidebar-accent {collapsed
								? 'justify-center px-0'
								: ''} {locked(item) ? 'text-muted-foreground' : ''}"
						>
							<item.icon class="size-4 shrink-0" />
							{#if !collapsed}
								<span class="flex-1 truncate">{workspace.t(item.label)}</span>
								{#if locked(item)}<Lock class="size-3.5" aria-label={workspace.t('ui.ws.shell.not_booked')} />{/if}
							{/if}
						</a>
					{/each}
				</div>
			{/each}
		</nav>
	</SidebarContent>
</Sidebar>
