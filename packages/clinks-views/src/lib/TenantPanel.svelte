<script lang="ts">
	import type { TenantViewModel } from '@clinks/clinks-runtime';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Label } from '@clinks/ui-shared/components/ui/label';
	import * as Table from '@clinks/ui-shared/components/ui/table';

	let { model }: { model: TenantViewModel } = $props();
	const t = (key: string) => useClinksRuntime().translations.t(key);
</script>

<Card.Root>
	<Card.Header><Card.Title>{t('ui.tenants')}</Card.Title></Card.Header>
	<Card.Content class="space-y-5">
		<form
			class="flex gap-2"
			onsubmit={(event) => {
				event.preventDefault();
				void model.createTenant();
			}}
		>
			<div class="min-w-0 flex-1">
				<Label class="sr-only" for="tenant-name">{t('ui.tenant_name')}</Label><Input
					id="tenant-name"
					bind:value={model.tenantName}
					required
					minlength={2}
					placeholder={t('ui.tenant_name')}
				/>
			</div>
			<Button type="submit">{t('ui.create_tenant')}</Button>
		</form>
		{#if (model.tenants.data?.length ?? 0) > 0}
			<Table.Root
				><Table.Header><Table.Row><Table.Head>{t('ui.tenants')}</Table.Head></Table.Row></Table.Header><Table.Body
					>{#each model.tenants.data ?? [] as tenant}<Table.Row
							><Table.Cell class="font-medium">{tenant.name}</Table.Cell></Table.Row
						>{/each}</Table.Body
				></Table.Root
			>
		{:else}
			<p class="text-sm text-muted-foreground">{t('ui.no_tenants')}</p>
		{/if}
	</Card.Content>
</Card.Root>
