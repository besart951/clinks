<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Lock from '@lucide/svelte/icons/lock';
	import Search from '@lucide/svelte/icons/search';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import { Sidebar, SidebarContent, getSidebarContext } from '@clinks/ui/components/ui/sidebar';
	import TenantSwitcher from './TenantSwitcher.svelte';
	import NotificationBell from './NotificationBell.svelte';
	import SyncStatus from './SyncStatus.svelte';
	import UserMenu from './UserMenu.svelte';
	import { navigationAccess, navigationGroups, type NavigationItem } from '#lib/features/shell/navigation-items';
	import { NavBadges } from '#lib/features/shell/nav-badges.svelte';
	import LocalePicker from './LocalePicker.svelte';
	import { href, routePath } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { actions }: { actions: { search: () => void; shortcuts: () => void } } = $props();

	const workspace = useWorkspace();
	const sidebar = getSidebarContext();
	const session = workspace.session;
	const badges = new NavBadges(workspace);
	const sidebarKey = 'clinks.workspace.sidebar.open';
	let dark = $state(false);
	/** Collapsed on a wide screen: an icon rail with tooltips instead of the full menu. */
	const rail = $derived(!sidebar.mobile && !sidebar.open);

	onMount(() => {
		dark = document.documentElement.classList.contains('dark');
		if (!sidebar.mobile) sidebar.open = workspace.platform.preferences.read(sidebarKey, true);
		return badges.resource.connect();
	});

	const groups = $derived(
		navigationGroups
			.map((group) => ({
				...group,
				items: group.items.filter(
					(item) => item.path !== '/settings' && ['open', 'locked'].includes(navigationAccess(item, session)),
				),
			}))
			.filter((group) => group.items.length > 0),
	);
	const settingsActive = $derived(routePath(page.url).startsWith('/settings'));

	function locked(item: NavigationItem) {
		return navigationAccess(item, session) === 'locked';
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

	/** Cmd/Ctrl + B, like most editors; ignored while typing so rich text keeps its bold shortcut. */
	function onKeydown(event: KeyboardEvent) {
		if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'b' || sidebar.mobile) return;
		const target = event.target as HTMLElement | null;
		if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
		event.preventDefault();
		toggleSidebar();
	}

	function toggleSidebar() {
		sidebar.toggle();
		workspace.platform.preferences.write(sidebarKey, sidebar.open);
	}

	function toggleTheme() {
		workspace.theme.toggle();
		dark = document.documentElement.classList.contains('dark');
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if sidebar.mobile && sidebar.open}
	<button
		class="fixed inset-0 z-20 bg-black/40 md:hidden"
		aria-label={workspace.t('ui.ws.shell.close_menu')}
		onclick={() => sidebar.close()}
	></button>
{/if}

<Sidebar class="border-r">
	<div class="flex shrink-0 items-center gap-1 pt-4 pb-2 {rail ? 'justify-center px-2' : 'px-3'}">
		{#if !rail}
			<TenantSwitcher />
			<NotificationBell />
		{/if}
		{#if !sidebar.mobile}
			<button
				type="button"
				class="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground grid size-8 shrink-0 place-items-center rounded-md"
				aria-expanded={sidebar.open}
				aria-keyshortcuts="Meta+B Control+B"
				title={workspace.t(rail ? 'ui.ws.shell.expand_sidebar' : 'ui.ws.shell.collapse_sidebar')}
				aria-label={workspace.t(rail ? 'ui.ws.shell.expand_sidebar' : 'ui.ws.shell.collapse_sidebar')}
				onclick={toggleSidebar}
			>
				{#if rail}<PanelLeftOpen class="size-4" />{:else}<PanelLeftClose class="size-4" />{/if}
			</button>
		{/if}
	</div>
	<div class="pb-2 {rail ? 'px-2' : 'px-3'}">
		<button
			type="button"
			class="text-muted-foreground hover:bg-accent flex h-8 w-full items-center gap-2 rounded-md border text-[13px] {rail
				? 'justify-center'
				: 'px-2.5'}"
			onclick={actions.search}
			aria-keyshortcuts="Meta+K"
			title={rail ? workspace.t('ui.ws.shell.search_actions') : undefined}
		>
			<Search class="size-3.5" />
			<span class="flex-1 text-left {rail ? 'sr-only' : ''}">{workspace.t('ui.ws.shell.search_actions')}</span>
			{#if !rail}<kbd class="bg-muted rounded border px-1 font-sans text-[10px]">⌘K</kbd>{/if}
		</button>
	</div>
	<SidebarContent class={rail ? 'px-2' : 'px-3'}>
		<nav aria-label={workspace.t('ui.ws.shell.main_navigation')} class="grid gap-4 py-2">
			{#each groups as group, index (group.label)}
				<div class="grid gap-0.5">
					{#if index > 0 && !rail}
						<p class="text-muted-foreground px-2 pb-1 text-[13px] font-medium">{workspace.t(group.label)}</p>
					{:else if index > 0}
						<hr class="mx-1 mb-1" />
					{/if}
					{#each group.items as item (item.path)}
						{@const badge = locked(item) ? undefined : badges.get(item.path)}
						<a
							href={href(target(item))}
							onclick={closeOnMobile}
							aria-current={active(item) ? 'page' : undefined}
							title={rail ? workspace.t(item.label) : undefined}
							class="hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent text-foreground/80 aria-[current=page]:text-foreground relative flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors aria-[current=page]:font-medium {rail
								? 'justify-center'
								: ''} {locked(item) ? 'text-muted-foreground' : ''}"
						>
							<item.icon class="size-4 shrink-0 opacity-80" />
							<span class="flex-1 truncate {rail ? 'sr-only' : ''}">{workspace.t(item.label)}</span>
							{#if locked(item) && !rail}<Lock
									class="size-3.5"
									aria-label={workspace.t('ui.ws.shell.not_booked')}
								/>{/if}
							{#if badge && rail}
								<span
									class="absolute top-1 right-1 size-2 rounded-full {badge.tone === 'attention'
										? 'bg-[var(--warning)]'
										: 'bg-[var(--label-blue)]'}"
								></span>
								<span class="sr-only">{workspace.t('ui.ws.shell.badge', { count: badge.count })}</span>
							{:else if badge}
								<span
									class="grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-semibold text-background tabular-nums {badge.tone ===
									'attention'
										? 'bg-[var(--warning)]'
										: 'bg-[var(--label-blue)]'}"
									aria-label={workspace.t('ui.ws.shell.badge', { count: badge.count })}
								>
									{badge.count}
								</span>
							{/if}
						</a>
					{/each}
				</div>
			{/each}
		</nav>
	</SidebarContent>
	<div class="grid shrink-0 grid-cols-[minmax(0,1fr)] gap-1 pt-2 pb-3 {rail ? 'px-2' : 'px-3'}">
		{#if !rail}
			<p class="bg-muted text-muted-foreground mb-1 rounded-md px-2.5 py-2 text-[11px] leading-snug">
				<span class="mr-1 inline-block size-1.5 rounded-full bg-[var(--warning)] align-middle"
				></span>{workspace.persistent
					? workspace.t('ui.ws.shell.demo_note')
					: workspace.t('ui.ws.shell.demo_note_volatile')}
			</p>
			<div class="mb-1"><LocalePicker look="full" /></div>
		{/if}
		<button
			type="button"
			class="hover:bg-sidebar-accent text-foreground/80 flex h-8 items-center gap-2.5 rounded-md px-2 text-sm {rail
				? 'justify-center'
				: ''}"
			title={rail ? workspace.t(dark ? 'ui.ws.shell.light_theme' : 'ui.ws.shell.dark_theme') : undefined}
			onclick={toggleTheme}
		>
			{#if dark}<Sun class="size-4 opacity-80" />{:else}<Moon class="size-4 opacity-80" />{/if}
			<span class={rail ? 'sr-only' : ''}>
				{dark ? workspace.t('ui.ws.shell.light_theme') : workspace.t('ui.ws.shell.dark_theme')}
			</span>
		</button>
		<a
			href={href('/settings')}
			onclick={closeOnMobile}
			aria-current={settingsActive ? 'page' : undefined}
			title={rail ? workspace.t('ui.ws.nav.settings') : undefined}
			class="hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent text-foreground/80 flex h-8 items-center gap-2.5 rounded-md px-2 text-sm aria-[current=page]:font-medium {rail
				? 'justify-center'
				: ''}"
		>
			<SlidersHorizontal class="size-4 opacity-80" /><span class={rail ? 'sr-only' : ''}>
				{workspace.t('ui.ws.nav.settings')}
			</span>
		</a>
		<div class="mt-1 flex items-center gap-2 border-t pt-2" class:hidden={rail}>
			<UserMenu onShortcuts={actions.shortcuts} />
			<SyncStatus />
		</div>
	</div>
</Sidebar>
