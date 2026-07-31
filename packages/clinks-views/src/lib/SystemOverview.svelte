<script lang="ts">
	import type { SystemStatsViewModel } from '@clinks/clinks-runtime';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import * as Card from '@clinks/ui-shared/components/ui/card';

	let { model }: { model: SystemStatsViewModel } = $props();
	const t = (key: string) => useClinksRuntime().translations.t(key);
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
	<Card.Root>
		<Card.Header><Card.Title class="text-sm font-medium">{t('ui.tenants')}</Card.Title></Card.Header>
		<Card.Content><p class="text-2xl font-bold">{model.stats.data?.tenantCount ?? '-'}</p></Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header><Card.Title class="text-sm font-medium">{t('ui.role_user')}</Card.Title></Card.Header>
		<Card.Content><p class="text-2xl font-bold">{model.stats.data?.userCount ?? '-'}</p></Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header><Card.Title class="text-sm font-medium">{t('ui.invite_user')}</Card.Title></Card.Header>
		<Card.Content><p class="text-2xl font-bold">{model.stats.data?.pendingInvitationCount ?? '-'}</p></Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header><Card.Title class="text-sm font-medium">{t('ui.languages')}</Card.Title></Card.Header>
		<Card.Content><p class="text-2xl font-bold">{model.stats.data?.activeLanguageCount ?? '-'}</p></Card.Content>
	</Card.Root>
</div>
