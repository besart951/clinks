<script lang="ts">
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import { Sidebar, SidebarContent, SidebarGroup, SidebarMenuButton } from '@clinks/ui-shared/components/ui/sidebar';
	import { LayoutDashboard, Users, Building2, MailPlus, Languages, ScrollText } from '@lucide/svelte';

	let {
		activeSection = 'overview',
		onNavigate = (_section: string) => {},
	}: {
		activeSection: string;
		onNavigate: (section: string) => void;
	} = $props();

	const runtime = useClinksRuntime();
	const t = (key: string) => runtime.translations.t(key);

	const navItems = [
		{ id: 'dashboard', path: '/dashboard', label: 'ui.dashboard', icon: LayoutDashboard },
		{ id: 'users', path: '/users', label: 'ui.role_user', icon: Users },
		{ id: 'tenants', path: '/tenants', label: 'ui.tenants', icon: Building2 },
		{ id: 'invites', path: '/invites', label: 'ui.invite_user', icon: MailPlus },
		{ id: 'localization', path: '/localization', label: 'ui.languages', icon: Languages },
		{ id: 'audit', path: '/audit', label: 'ui.audit_log', icon: ScrollText },
	];
</script>

<Sidebar>
	<SidebarContent>
		{#each navItems as item}
			<SidebarGroup>
				<SidebarMenuButton
					active={activeSection === item.id}
					tooltip={t(item.label)}
					onclick={() => onNavigate(item.id)}
				>
					<item.icon class="h-4 w-4 shrink-0" />
					<span class="truncate">{t(item.label)}</span>
				</SidebarMenuButton>
			</SidebarGroup>
		{/each}
	</SidebarContent>
</Sidebar>
