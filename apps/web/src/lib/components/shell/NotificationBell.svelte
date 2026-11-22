<script lang="ts">
	import { onMount } from 'svelte';
	import Bell from '@lucide/svelte/icons/bell';
	import * as Popover from '@clinks/ui/components/ui/popover';
	import { Button } from '@clinks/ui/components/ui/button';
	import { NotificationsModel } from '#lib/features/notifications/notifications.svelte';
	import { href, navigate } from '#lib/navigation';
	import type { AppNotification } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new NotificationsModel(workspace);
	let open = $state(false);
	onMount(() => model.resource.connect());

	async function openNotification(notification: AppNotification) {
		open = false;
		await model.markRead(notification);
		await navigate(notification.href);
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon"
				class="relative"
				aria-label={workspace.t('ui.ws.notifications.button', { count: model.unread })}
			>
				<Bell class="size-4" />
				{#if model.unread > 0}
					<span
						class="bg-destructive absolute top-1 right-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-semibold text-white"
					>
						{model.unread}
					</span>
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-80 p-0">
		<div class="flex items-center justify-between border-b px-3 py-2">
			<p class="text-sm font-medium">{workspace.t('ui.ws.notifications.title')}</p>
			<Button variant="ghost" size="xs" disabled={model.unread === 0} onclick={() => model.markAllRead()}>
				{workspace.t('ui.ws.notifications.mark_all')}
			</Button>
		</div>
		<ul class="max-h-80 overflow-y-auto" aria-live="polite">
			{#each (model.resource.data ?? []).slice(0, 8) as notification (notification.id)}
				<li>
					<button
						class="hover:bg-muted flex w-full gap-2 px-3 py-2 text-left text-sm"
						onclick={() => openNotification(notification)}
					>
						<span class="mt-1.5 size-2 shrink-0 rounded-full {notification.read ? 'bg-transparent' : 'bg-sky-500'}"
						></span>
						<span class="min-w-0 flex-1">
							<span class="block">{model.text(notification)}</span>
							<span class="text-muted-foreground text-xs">{workspace.i18n.relative(notification.createdAt)}</span>
						</span>
					</button>
				</li>
			{:else}
				<li class="text-muted-foreground px-3 py-6 text-center text-sm">{workspace.t('ui.ws.notifications.empty')}</li>
			{/each}
		</ul>
		<a
			class="hover:bg-muted block border-t px-3 py-2 text-center text-sm"
			href={href('/notifications')}
			onclick={() => (open = false)}
		>
			{workspace.t('ui.ws.notifications.show_all')}
		</a>
	</Popover.Content>
</Popover.Root>
