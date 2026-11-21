<script lang="ts">
	import { onMount } from 'svelte';
	import Bell from '@lucide/svelte/icons/bell';
	import * as Tabs from '@clinks/ui-shared/components/ui/tabs';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import { NotificationsModel } from '$lib/features/notifications/notifications.svelte';
	import type { AppNotification } from '$lib/domain/types';
	import { navigate } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new NotificationsModel(workspace);
	let filter = $state<'all' | 'unread'>('all');
	onMount(() => model.resource.connect());

	async function open(notification: AppNotification) {
		await model.markRead(notification);
		await navigate(notification.href);
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.notifications.title')} · CLinks</title></svelte:head>

<PageHeader title={workspace.t('ui.ws.notifications.title')}>
	{#snippet actions()}<Button variant="outline" disabled={model.unread === 0} onclick={() => model.markAllRead()}>{workspace.t('ui.ws.notifications.mark_all')}</Button>{/snippet}
</PageHeader>
<Tabs.Root bind:value={filter} class="mb-4">
	<Tabs.List><Tabs.Trigger value="all">{workspace.t('ui.ws.contacts.kind_all')}</Tabs.Trigger><Tabs.Trigger value="unread">{workspace.t('ui.ws.mail.unread')} ({model.unread})</Tabs.Trigger></Tabs.List>
</Tabs.Root>
<AsyncView resource={model.resource} isEmpty={(rows) => rows.filter((row) => filter === 'all' || !row.read).length === 0}>
	{#snippet empty()}<EmptyState icon={Bell} title={workspace.t('ui.ws.notifications.empty')} />{/snippet}
	{#snippet children(rows)}
		<ul class="divide-y rounded-xl border">
			{#each rows.filter((row) => filter === 'all' || !row.read) as notification (notification.id)}
				<li>
					<button class="hover:bg-muted/60 flex w-full items-start gap-3 px-4 py-3 text-left text-sm" onclick={() => open(notification)}>
						<span class="mt-1.5 size-2 shrink-0 rounded-full {notification.read ? 'bg-transparent' : 'bg-sky-500'}"></span>
						<span class="flex-1 {notification.read ? '' : 'font-medium'}">{model.text(notification)}</span>
						<span class="text-muted-foreground shrink-0 text-xs">{workspace.i18n.relative(notification.createdAt)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/snippet}
</AsyncView>
