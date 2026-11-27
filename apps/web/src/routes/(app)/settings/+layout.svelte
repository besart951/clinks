<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Building2 from '@lucide/svelte/icons/building-2';
	import Users from '@lucide/svelte/icons/users';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import Lock from '@lucide/svelte/icons/lock';
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import AtSign from '@lucide/svelte/icons/at-sign';
	import type { Permission } from '@clinks/domain/types';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Check from '@lucide/svelte/icons/check';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import { href, navigate, routePath } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { children }: { children: Snippet } = $props();
	const workspace = useWorkspace();
	const items: { path: string; label: string; icon: typeof UserRound; permission?: Permission }[] = [
		{ path: '/settings/profile', label: 'ui.ws.settings.profile', icon: UserRound },
		{ path: '/settings', label: 'ui.ws.settings.company', icon: Building2, permission: 'settings.manage' },
		{ path: '/settings/storage', label: 'ui.ws.settings.storage', icon: HardDrive, permission: 'settings.manage' },
		{ path: '/settings/mail', label: 'ui.ws.settings.mail', icon: AtSign, permission: 'settings.manage' },
		{ path: '/settings/team', label: 'ui.ws.settings.team', icon: Users, permission: 'team.manage' },
		{ path: '/settings/roles', label: 'ui.ws.settings.roles', icon: ShieldCheck, permission: 'roles.manage' },
		{ path: '/settings/billing', label: 'ui.ws.settings.billing', icon: CreditCard, permission: 'billing.manage' },
		{ path: '/settings/privacy', label: 'ui.ws.settings.privacy', icon: Lock },
	];
	const visible = $derived(items.filter((item) => !item.permission || workspace.session.can(item.permission)));
	const current = $derived(routePath(page.url));
	const active = $derived(visible.find((item) => item.path === current));
</script>

<div class="grid gap-4 lg:grid-cols-[13rem_1fr] lg:gap-6">
	<!-- Phones: one button with the current section opens the others, instead of three rows of links. -->
	{#if active}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						class="bg-muted flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium lg:hidden"
					>
						<active.icon class="size-4" />
						<span class="text-muted-foreground font-normal">{workspace.t('ui.ws.nav.settings')} ·</span>
						{workspace.t(active.label)}
						<ChevronDown class="text-muted-foreground ms-auto size-4" />
					</button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start">
				{#each visible as item (item.path)}
					<DropdownMenu.Item class="min-h-10" onclick={() => navigate(item.path)}>
						<item.icon class="size-4" />{workspace.t(item.label)}
						{#if item === active}<Check class="ms-auto size-4" />{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
	<nav class="hidden gap-1 lg:flex lg:flex-col" aria-label={workspace.t('ui.ws.nav.settings')}>
		{#each visible as item (item.path)}
			<a
				href={href(item.path)}
				class="hover:bg-muted flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm aria-[current=page]:bg-muted aria-[current=page]:font-medium"
				aria-current={current === item.path ? 'page' : undefined}
			>
				<item.icon class="size-4" />{workspace.t(item.label)}
			</a>
		{/each}
	</nav>
	<div class="min-w-0">{@render children()}</div>
</div>
