<script lang="ts">
	import LogOut from '@lucide/svelte/icons/log-out';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import LifeBuoy from '@lucide/svelte/icons/life-buoy';
	import * as DropdownMenu from '@clinks/ui-shared/components/ui/dropdown-menu';
	import PersonAvatar from '#lib/components/common/PersonAvatar.svelte';
	import { navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { onShortcuts }: { onShortcuts: () => void } = $props();
	const workspace = useWorkspace();
	const session = workspace.session;

	async function signOut() {
		session.signOut();
		await navigate('/login');
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="hover:bg-sidebar-accent flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-sm"
		aria-label={workspace.t('ui.ws.shell.account_menu')}
	>
		{#if session.user}
			<PersonAvatar
				person={{
					name: session.displayName,
					avatarColor: session.user.avatarColor,
					avatarDataUrl: session.user.avatarDataUrl,
				}}
				size="xs"
			/>
			<span class="min-w-0 flex-1 truncate">
				{session.displayName}<span class="text-muted-foreground"> · {session.role?.name}</span>
			</span>
		{/if}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" side="top" class="w-60">
		<DropdownMenu.Label>
			<p class="truncate text-sm font-medium">{session.displayName}</p>
			<p class="text-muted-foreground truncate text-xs font-normal">{session.user?.email}</p>
			<p class="text-muted-foreground truncate text-xs font-normal">{session.role?.name}</p>
		</DropdownMenu.Label>
		<DropdownMenu.Separator />
		<DropdownMenu.Item onclick={() => navigate('/settings/profile')}>
			<UserRound class="size-4" />{workspace.t('ui.ws.settings.profile')}
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={onShortcuts}>
			<Keyboard class="size-4" />{workspace.t('ui.ws.shortcuts.title')}<DropdownMenu.Shortcut>?</DropdownMenu.Shortcut>
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => navigate('/help')}>
			<LifeBuoy class="size-4" />{workspace.t('ui.ws.help.title')}
		</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Item onclick={signOut}><LogOut class="size-4" />{workspace.t('ui.sign_out')}</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
