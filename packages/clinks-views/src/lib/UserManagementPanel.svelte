<script lang="ts">
	import type { UserManagementViewModel } from '@clinks/clinks-runtime';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import * as Table from '@clinks/ui-shared/components/ui/table';
	import SearchFilterBar from '@clinks/ui-shared/SearchFilterBar.svelte';
	import { infiniteScroll } from '@clinks/ui-shared/actions/infinite-scroll.ts';

	let { model }: { model: UserManagementViewModel } = $props();
	const t = (key: string) => useClinksRuntime().translations.t(key);

	let tableContainer: HTMLElement;
	$effect(() => {
		const node = tableContainer;
		if (!node) return;
		return infiniteScroll(node, () => model.list.loadMore()).destroy;
	});
</script>

<Card.Root>
	<Card.Header><Card.Title>{t('ui.role_user')}</Card.Title></Card.Header>
	<Card.Content class="space-y-4">
		<SearchFilterBar
			search={model.list.search}
			searchPlaceholder={t('ui.search')}
			resetLabel={t('ui.reset')}
			onsearch={(q) => model.list.onSearch(q)}
			filters={[
				{
					key: 'role',
					label: t('ui.role'),
					value: model.list.filters.role,
					options: [
						{ value: 'user', label: t('ui.role_user') },
						{ value: 'super_administrator', label: t('ui.super_administrator') },
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
						><Table.Head>{t('ui.email')}</Table.Head><Table.Head>{t('ui.locale')}</Table.Head><Table.Head
							>{t('ui.role')}</Table.Head
						><Table.Head>{t('ui.tenants')}</Table.Head></Table.Row
					></Table.Header
				>
				<Table.Body>
					{#each model.list.items as user (user.id)}
						<Table.Row class="cursor-pointer hover:bg-muted" onclick={() => model.openDetail(user.id)}>
							<Table.Cell>{user.email}</Table.Cell>
							<Table.Cell>{user.locale}</Table.Cell>
							<Table.Cell>
								<Badge variant="outline"
									>{user.globalRole === 'super_administrator' ? t('ui.super_administrator') : t('ui.role_user')}</Badge
								>
							</Table.Cell>
							<Table.Cell>{user.membershipCount}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
		{#if model.list.loading}<p class="text-muted-foreground text-sm">{t('ui.loading')}</p>{/if}
	</Card.Content>
</Card.Root>

{#if model.detail.data}
	<Card.Root class="mt-4">
		<Card.Header
			><Card.Title>{model.detail.data.user.email}</Card.Title><Button
				type="button"
				variant="ghost"
				size="sm"
				onclick={() => model.closeDetail()}>✕</Button
			></Card.Header
		>
		<Card.Content>
			<p class="text-muted-foreground text-sm">{t('ui.user_id')}: {model.detail.data.user.id}</p>
			{#if model.detail.data.memberships.length > 0}
				<Table.Root class="mt-3">
					<Table.Header
						><Table.Row><Table.Head>{t('ui.tenants')}</Table.Head><Table.Head>{t('ui.role')}</Table.Head></Table.Row
						></Table.Header
					>
					<Table.Body>
						{#each model.detail.data.memberships as m (m.id)}
							<Table.Row
								><Table.Cell>{m.tenant.name}</Table.Cell><Table.Cell
									><Badge variant="outline">{m.role.name}</Badge></Table.Cell
								></Table.Row
							>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
