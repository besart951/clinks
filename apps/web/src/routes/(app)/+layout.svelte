<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import Search from '@lucide/svelte/icons/search';
	import { SidebarProvider, SidebarTrigger, SidebarInset } from '@clinks/ui-shared/components/ui/sidebar';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import AppSidebar from '#lib/components/shell/AppSidebar.svelte';
	import Banners from '#lib/components/shell/Banners.svelte';
	import CommandPalette from '#lib/components/shell/CommandPalette.svelte';
	import DevPanel from '#lib/components/shell/DevPanel.svelte';
	import MobileNav from '#lib/components/shell/MobileNav.svelte';
	import ShortcutsDialog from '#lib/components/shell/ShortcutsDialog.svelte';
	import SkeletonRows from '#lib/components/common/SkeletonRows.svelte';
	import { landingPath } from '#lib/features/auth/auth-forms.svelte';
	import { allNavigationItems } from '#lib/features/shell/navigation-items';
	import { navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { children }: { children: Snippet } = $props();
	const workspace = useWorkspace();
	const session = workspace.session;
	const ready = $derived(session.status === 'authenticated' && session.tenantId !== null);
	let paletteOpen = $state(false);
	let shortcutsOpen = $state(false);
	let leader = 0;

	onMount(async () => {
		await session.ready;
		if (session.status !== 'authenticated' || !session.tenantId)
			await navigate(landingPath(session), { replace: true });
	});

	function typing(target: EventTarget | null) {
		return (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		);
	}

	function onKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			paletteOpen = !paletteOpen;
			return;
		}
		if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.key === '?') {
			shortcutsOpen = true;
		} else if (event.key === 'g') {
			leader = Date.now();
		} else if (Date.now() - leader < 1200) {
			const item = allNavigationItems.find((candidate) => candidate.shortcut === event.key);
			leader = 0;
			if (item) void navigate(item.path);
		} else if (event.key === 'n' && workspace.newAction) {
			event.preventDefault();
			workspace.newAction();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if ready}
	<SidebarProvider>
		{#key session.tenantId}
			{#key session.tenantId}
				<AppSidebar actions={{ search: () => (paletteOpen = true), shortcuts: () => (shortcutsOpen = true) }} />
			{/key}
		{/key}
		<SidebarInset class="flex min-h-dvh min-w-0 flex-col pb-16 md:pb-0">
			<Banners />
			<header
				class="bg-background/90 sticky top-0 z-10 flex h-12 items-center gap-2 border-b px-3 backdrop-blur md:hidden"
			>
				<SidebarTrigger />
				<span class="flex-1 truncate text-sm font-semibold">{session.tenant?.name}</span>
				<Button
					variant="ghost"
					size="icon-sm"
					onclick={() => (paletteOpen = true)}
					aria-label={workspace.t('ui.ws.shell.search')}
				>
					<Search class="size-4" />
				</Button>
			</header>
			<main class="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-8 sm:py-7">
				{@render children()}
			</main>
		</SidebarInset>
		<MobileNav />
		<CommandPalette bind:open={paletteOpen} />
		<ShortcutsDialog bind:open={shortcutsOpen} />
		<DevPanel />
	</SidebarProvider>
{:else}
	<div class="mx-auto max-w-2xl p-10"><SkeletonRows /></div>
{/if}
