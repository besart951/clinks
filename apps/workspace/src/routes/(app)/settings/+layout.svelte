<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Building2 from '@lucide/svelte/icons/building-2';
	import Users from '@lucide/svelte/icons/users';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import Lock from '@lucide/svelte/icons/lock';
	import type { Permission } from '$lib/domain/types';
	import { href, routePath } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	let { children }: { children: Snippet } = $props();
	const workspace = useWorkspace();
	const items: { path: string; label: string; icon: typeof UserRound; permission?: Permission }[] = [
		{ path: '/settings/profile', label: 'ui.ws.settings.profile', icon: UserRound },
		{ path: '/settings', label: 'ui.ws.settings.company', icon: Building2, permission: 'settings.manage' },
		{ path: '/settings/team', label: 'ui.ws.settings.team', icon: Users, permission: 'team.manage' },
		{ path: '/settings/roles', label: 'ui.ws.settings.roles', icon: ShieldCheck, permission: 'roles.manage' },
		{ path: '/settings/billing', label: 'ui.ws.settings.billing', icon: CreditCard, permission: 'billing.manage' },
		{ path: '/settings/privacy', label: 'ui.ws.settings.privacy', icon: Lock },
	];
	const visible = $derived(items.filter((item) => !item.permission || workspace.session.can(item.permission)));
	const current = $derived(routePath(page.url));
</script>

<div class="grid gap-6 lg:grid-cols-[13rem_1fr]">
	<nav class="flex gap-1 overflow-x-auto lg:flex-col" aria-label={workspace.t('ui.ws.nav.settings')}>
		{#each visible as item (item.path)}
			<a href={href(item.path)} class="hover:bg-muted flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm aria-[current=page]:bg-muted aria-[current=page]:font-medium" aria-current={current === item.path ? 'page' : undefined}>
				<item.icon class="size-4" />{workspace.t(item.label)}
			</a>
		{/each}
	</nav>
	<div class="min-w-0">{@render children()}</div>
</div>
