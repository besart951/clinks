<script lang="ts">
	import type { InvitationViewModel } from '@clinks/clinks-runtime';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import * as Table from '@clinks/ui-shared/components/ui/table';
	import SearchFilterBar from '@clinks/ui-shared/SearchFilterBar.svelte';
	import { infiniteScroll } from '@clinks/ui-shared/actions/infinite-scroll.ts';

	let { model }: { model: InvitationViewModel } = $props();
	const t = (key: string) => useClinksRuntime().translations.t(key);

	let tableContainer: HTMLElement;
	$effect(() => {
		const node = tableContainer;
		if (!node) return;
		return infiniteScroll(node, () => model.list.loadMore()).destroy;
	});
</script>

<Card.Root>
	<Card.Header><Card.Title>{t('ui.invite_user')}</Card.Title></Card.Header>
	<Card.Content class="space-y-4">
		<SearchFilterBar
			search={model.list.search}
			searchPlaceholder={t('ui.search')}
			resetLabel={t('ui.reset')}
			onsearch={(q) => model.list.onSearch(q)}
			filters={[
				{
					key: 'status',
					label: t('ui.status'),
					value: model.list.filters.status,
					options: [
						{ value: 'pending', label: t('ui.invitation_pending') },
						{ value: 'used', label: t('ui.invitation_used') },
						{ value: 'expired', label: t('ui.invitation_expired') },
					],
				},
			]}
			onfilter={(k, v) => model.list.onFilter(k, v)}
			onrefresh={() => model.list.refresh()}
		/>
		<div bind:this={tableContainer} class="max-h-80 overflow-y-auto">
			<Table.Root>
				<Table.Header
					><Table.Row
						><Table.Head>{t('ui.email')}</Table.Head><Table.Head>{t('ui.tenant_id')}</Table.Head><Table.Head
							>{t('ui.role')}</Table.Head
						><Table.Head></Table.Head></Table.Row
					></Table.Header
				>
				<Table.Body>
					{#each model.list.items as inv}
						{@const pending = !inv.usedAt && new Date(inv.expiresAt) > new Date()}
						<Table.Row>
							<Table.Cell>{inv.email}</Table.Cell>
							<Table.Cell>{inv.tenantId}</Table.Cell>
							<Table.Cell><Badge variant="outline">{inv.role}</Badge></Table.Cell>
							<Table.Cell>
								{#if pending}
									<Button type="button" variant="destructive" size="sm" onclick={() => model.revoke(inv.id)}
										>{t('ui.revoke')}</Button
									>
								{:else}
									<span class="text-muted-foreground text-xs"
										>{inv.usedAt ? t('ui.invitation_used') : t('ui.invitation_expired')}</span
									>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
		{#if model.list.loading}<p class="text-muted-foreground text-sm">{t('ui.loading')}</p>{/if}
	</Card.Content>
</Card.Root>
