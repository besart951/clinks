<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Lock from '@lucide/svelte/icons/lock';
	import Search from '@lucide/svelte/icons/search';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import { Sidebar, SidebarContent, getSidebarContext } from '@clinks/ui-shared/components/ui/sidebar';
	import TenantSwitcher from './TenantSwitcher.svelte';
	import NotificationBell from './NotificationBell.svelte';
	import SyncStatus from './SyncStatus.svelte';
	import UserMenu from './UserMenu.svelte';
	import { navigationGroups, type NavigationItem } from '$lib/features/shell/navigation-items';
	import { NavBadges } from '$lib/features/shell/nav-badges.svelte';
	import { locales, type Locale } from '$lib/i18n/catalog';
	import { href, routePath } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	let { actions }: { actions: { search: () => void; shortcuts: () => void } } = $props();

	const workspace = useWorkspace();
	const sidebar = getSidebarContext();
	const session = workspace.session;
	const badges = new NavBadges(workspace);
	const localeNames: { [locale in Locale]: string } = { 'de-CH': 'DE', 'en-US': 'EN' };
	let dark = $state(false);

	onMount(() => {
		dark = document.documentElement.classList.contains('dark');
		return badges.resource.connect();
	});

	const groups = $derived(
		navigationGroups
			.map((group) => ({
				...group,
				items: group.items.filter(
					(item) => item.path !== '/settings' && (!item.permission || session.can(item.permission)),
				),
			}))
			.filter((group) => group.items.length > 0),
	);
	const settingsActive = $derived(routePath(page.url).startsWith('/settings'));

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

	function toggleTheme() {
		workspace.theme.toggle();
		dark = document.documentElement.classList.contains('dark');
	}
</script>

{#if sidebar.mobile && sidebar.open}
	<button
		class="fixed inset-0 z-20 bg-black/40 md:hidden"
		aria-label={workspace.t('ui.ws.shell.close_menu')}
		onclick={() => sidebar.close()}
	></button>
{/if}

<Sidebar class="border-r">
	<div class="flex shrink-0 items-center gap-1 px-3 pt-4 pb-2">
		<TenantSwitcher />
		<NotificationBell />
	</div>
	<div class="px-3 pb-2">
		<button
			type="button"
			class="text-muted-foreground hover:bg-accent flex h-8 w-full items-center gap-2 rounded-md border px-2.5 text-[13px]"
			onclick={actions.search}
			aria-keyshortcuts="Meta+K"
		>
			<Search class="size-3.5" />
			<span class="flex-1 text-left">{workspace.t('ui.ws.shell.search_actions')}</span>
			<kbd class="bg-muted rounded border px-1 font-sans text-[10px]">⌘K</kbd>
		</button>
	</div>
	<SidebarContent class="px-3">
		<nav aria-label={workspace.t('ui.ws.shell.main_navigation')} class="grid gap-4 py-2">
			{#each groups as group, index (group.label)}
				<div class="grid gap-0.5">
					{#if index > 0}
						<p class="text-muted-foreground px-2 pb-1 text-[13px] font-medium">{workspace.t(group.label)}</p>
					{/if}
					{#each group.items as item (item.path)}
						{@const badge = locked(item) ? undefined : badges.get(item.path)}
						<a
							href={href(target(item))}
							onclick={closeOnMobile}
							aria-current={active(item) ? 'page' : undefined}
							class="hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent text-foreground/80 aria-[current=page]:text-foreground flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors aria-[current=page]:font-medium {locked(
								item,
							)
								? 'text-muted-foreground'
								: ''}"
						>
							<item.icon class="size-4 shrink-0 opacity-80" />
							<span class="flex-1 truncate">{workspace.t(item.label)}</span>
							{#if locked(item)}<Lock class="size-3.5" aria-label={workspace.t('ui.ws.shell.not_booked')} />{/if}
							{#if badge}
								<span
									class="grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-semibold text-background tabular-nums {badge.tone ===
									'attention'
										? 'bg-[var(--warning)]'
										: 'bg-[var(--label-blue)]'}"
									aria-label={workspace.t('ui.ws.shell.badge', { count: badge.count })}>{badge.count}</span
								>
							{/if}
						</a>
					{/each}
				</div>
			{/each}
		</nav>
	</SidebarContent>
	<div class="grid shrink-0 grid-cols-[minmax(0,1fr)] gap-1 px-3 pt-2 pb-3">
		<p class="bg-muted text-muted-foreground mb-1 rounded-md px-2.5 py-2 text-[11px] leading-snug">
			<span class="mr-1 inline-block size-1.5 rounded-full bg-[var(--warning)] align-middle"
			></span>{workspace.persistent
				? workspace.t('ui.ws.shell.demo_note')
				: workspace.t('ui.ws.shell.demo_note_volatile')}
		</p>
		<div class="bg-muted mb-1 grid grid-cols-2 rounded-md p-0.5" role="group" aria-label={workspace.t('ui.languages')}>
			{#each locales as locale (locale)}
				<button
					type="button"
					class="h-7 rounded text-xs font-medium transition-colors {workspace.i18n.locale === locale
						? 'bg-background text-foreground shadow-[var(--shadow-sm)]'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={workspace.i18n.locale === locale}
					onclick={() => workspace.i18n.setLocale(locale)}>{localeNames[locale]}</button
				>
			{/each}
		</div>
		<button
			type="button"
			class="hover:bg-sidebar-accent text-foreground/80 flex h-8 items-center gap-2.5 rounded-md px-2 text-sm"
			onclick={toggleTheme}
		>
			{#if dark}<Sun class="size-4 opacity-80" />{:else}<Moon class="size-4 opacity-80" />{/if}
			{dark ? workspace.t('ui.ws.shell.light_theme') : workspace.t('ui.ws.shell.dark_theme')}
		</button>
		<a
			href={href('/settings')}
			onclick={closeOnMobile}
			aria-current={settingsActive ? 'page' : undefined}
			class="hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent text-foreground/80 flex h-8 items-center gap-2.5 rounded-md px-2 text-sm aria-[current=page]:font-medium"
			><SlidersHorizontal class="size-4 opacity-80" />{workspace.t('ui.ws.nav.settings')}</a
		>
		<div class="mt-1 flex items-center gap-2 border-t pt-2">
			<UserMenu onShortcuts={actions.shortcuts} />
			<SyncStatus />
		</div>
	</div>
</Sidebar>
