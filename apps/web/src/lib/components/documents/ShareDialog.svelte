<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import Link2 from '@lucide/svelte/icons/link-2';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { shareDays } from '@clinks/contracts/documents';
	import type { StoredDocument } from '@clinks/domain/types';
	import { ShareModel } from '#lib/features/documents/share.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** «Teilen-Link» for one file: anyone with the link downloads it, without an account, until it ends. */
	let { document = $bindable() }: { document: StoredDocument | null } = $props();
	const workspace = useWorkspace();
	const periods = {
		1: 'ui.ws.documents.share_day',
		7: 'ui.ws.documents.share_week',
		30: 'ui.ws.documents.share_month',
	};
	const model = $derived(document ? new ShareModel(workspace, document) : null);

	$effect(() => {
		void model?.load();
	});
</script>

<Dialog.Root open={document !== null} onOpenChange={(open) => !open && (document = null)}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-md">
		{#if model}
			<Dialog.Header>
				<Dialog.Title>{workspace.t('ui.ws.documents.share')}</Dialog.Title>
				<Dialog.Description>
					{workspace.t('ui.ws.documents.share_text', { name: model.document.name })}
				</Dialog.Description>
			</Dialog.Header>
			{#if model.link}
				<div class="space-y-2" role="status">
					<p class="text-sm">{workspace.t('ui.ws.documents.share_made')}</p>
					<div class="flex gap-2">
						<Input
							readonly
							value={model.link}
							aria-label={workspace.t('ui.ws.documents.share_link')}
							onfocus={(event) => event.currentTarget.select()}
						/>
						<Button variant="outline" onclick={() => model.copy()}>
							<Copy class="size-4" />{workspace.t('ui.ws.documents.share_copy')}
						</Button>
					</div>
				</div>
			{:else}
				<fieldset class="space-y-2">
					<legend class="text-sm font-medium">{workspace.t('ui.ws.documents.share_valid')}</legend>
					<div class="bg-muted inline-flex rounded-lg p-0.5">
						{#each shareDays as days (days)}
							<Button
								variant="ghost"
								size="sm"
								class="aria-pressed:bg-background aria-pressed:shadow-xs"
								aria-pressed={model.days === days}
								onclick={() => (model.days = days)}
							>
								{workspace.t(periods[days])}
							</Button>
						{/each}
					</div>
				</fieldset>
				<Button onclick={() => model.create()} disabled={model.busy}>
					<Link2 class="size-4" />{workspace.t('ui.ws.documents.share_create')}
				</Button>
			{/if}
			{#if model.active.length > 0}
				<section class="space-y-2 border-t pt-3" aria-labelledby="share-active">
					<h3 id="share-active" class="text-sm font-medium">{workspace.t('ui.ws.documents.share_active')}</h3>
					<ul class="space-y-1">
						{#each model.active as share (share.id)}
							<li class="flex items-center justify-between gap-2 text-sm">
								<span>
									{workspace.t('ui.ws.documents.share_until', { date: workspace.i18n.dateTime(share.expiresAt) })}
									<span class="text-muted-foreground text-xs">
										· {workspace.t('ui.ws.documents.share_opened', { count: share.openCount })}
									</span>
								</span>
								<Button variant="ghost" size="sm" class="text-destructive" onclick={() => model.revoke(share)}>
									{workspace.t('ui.ws.documents.share_end')}
								</Button>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>
