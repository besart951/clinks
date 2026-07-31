<script lang="ts">
	import type { AuditLogViewModel } from '@clinks/clinks-runtime';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Label } from '@clinks/ui-shared/components/ui/label';
	import * as Table from '@clinks/ui-shared/components/ui/table';

	let { model }: { model: AuditLogViewModel } = $props();
	const runtime = useClinksRuntime();
	const t = (key: string) => runtime.translations.t(key);
</script>

<Card.Root class="lg:col-span-2">
	<Card.Header
		><Card.Title>{t('ui.audit_log')}</Card.Title><Card.Description
			>{t('ui.audit_default_range')} {t('ui.audit_immutable')}</Card.Description
		></Card.Header
	>
	<Card.Content class="space-y-4">
		<form
			class="grid gap-3 md:grid-cols-6"
			onsubmit={(event) => {
				event.preventDefault();
				void model.filterAuditEvents();
			}}
		>
			<div class="grid gap-2">
				<Label for="audit-from">{t('ui.from')}</Label><Input
					id="audit-from"
					bind:value={model.auditFrom}
					type="datetime-local"
				/>
			</div>
			<div class="grid gap-2">
				<Label for="audit-to">{t('ui.to')}</Label><Input
					id="audit-to"
					bind:value={model.auditTo}
					type="datetime-local"
				/>
			</div>
			<div class="grid gap-2">
				<Label for="audit-actor">{t('ui.actor_id')}</Label><Input id="audit-actor" bind:value={model.auditActor} />
			</div>
			<div class="grid gap-2">
				<Label for="audit-tenant">{t('ui.tenant_id')}</Label><Input id="audit-tenant" bind:value={model.auditTenant} />
			</div>
			<div class="grid gap-2">
				<Label for="audit-action">{t('ui.action')}</Label><Input id="audit-action" bind:value={model.auditAction} />
			</div>
			<Button type="submit" class="self-end">{t('ui.filter')}</Button>
		</form>
		<Table.Root
			><Table.Header
				><Table.Row
					><Table.Head>{t('ui.occurred_at')}</Table.Head><Table.Head>{t('ui.actor_id')}</Table.Head><Table.Head
						>{t('ui.tenant_name')}</Table.Head
					><Table.Head>{t('ui.action')}</Table.Head><Table.Head>{t('ui.audit_description')}</Table.Head></Table.Row
				></Table.Header
			><Table.Body
				>{#each model.auditEvents as event}<Table.Row
						><Table.Cell>{model.formatDate(event.occurredAt, runtime.translations.locale)}</Table.Cell><Table.Cell
							>{event.actorEmail || event.actorId}</Table.Cell
						><Table.Cell>{event.tenantName || event.tenantId}</Table.Cell><Table.Cell
							><Badge variant="outline">{event.action}</Badge></Table.Cell
						><Table.Cell>{event.description}</Table.Cell></Table.Row
					>{/each}</Table.Body
			></Table.Root
		>
		{#if model.nextAuditCursor}<Button type="button" variant="outline" onclick={() => void model.loadMoreAuditEvents()}
				>{t('ui.load_more')}</Button
			>{/if}
	</Card.Content>
</Card.Root>
