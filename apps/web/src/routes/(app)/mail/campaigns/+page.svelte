<script lang="ts">
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Copy from '@lucide/svelte/icons/copy';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import StatusBadge from '#lib/components/common/StatusBadge.svelte';
	import { campaignTone } from '#lib/components/common/tones';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import MailNav from '#lib/components/mail/MailNav.svelte';
	import { CampaignListModel } from '#lib/features/mail/campaign.svelte';
	import { href, navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new CampaignListModel(workspace);
	const canWrite = $derived(workspace.session.can('mail.write'));

	onMount(() => {
		const stop = model.resource.connect();
		const stopShortcut = workspace.registerNewAction(() => canWrite && void create());
		return () => {
			stop();
			stopShortcut();
		};
	});

	async function create() {
		const campaign = await model.create();
		if (campaign) await navigate(`/mail/campaigns/${campaign.id}`);
	}

	function rate(part: number, total: number) {
		return total === 0 ? '—' : workspace.i18n.percent(Math.round((part / total) * 10_000));
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.campaign.title')} · CLinks</title></svelte:head>

<ModuleGate module="mail" permission="mail.read">
	<PageHeader title={workspace.t('ui.ws.module.mail')}>
		{#snippet actions()}
			{#if canWrite}<Button onclick={create}><Plus class="size-4" />{workspace.t('ui.ws.campaign.new')}</Button>{/if}
		{/snippet}
	</PageHeader>
	<MailNav />
	<AsyncView resource={model.resource} skeleton="cards" isEmpty={(rows) => rows.length === 0}>
		{#snippet empty()}
			<EmptyState
				icon={Megaphone}
				title={workspace.t('ui.ws.campaign.empty_title')}
				description={workspace.t('ui.ws.campaign.empty_text')}
			/>
		{/snippet}
		{#snippet children(campaigns)}
			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each campaigns as campaign (campaign.id)}
					<Card.Root class="hover:border-foreground/20 transition-colors">
						<Card.Header>
							<Card.Title>
								<a class="hover:underline" href={href(`/mail/campaigns/${campaign.id}`)}>{campaign.name}</a>
							</Card.Title>
							<Card.Description class="truncate">
								{campaign.subject || workspace.t('ui.ws.mail.no_subject')}
							</Card.Description>
							<Card.Action>
								<StatusBadge
									tone={campaignTone[campaign.status]}
									label={workspace.t(`ui.ws.campaign.status.${campaign.status}`)}
								/>
							</Card.Action>
						</Card.Header>
						<Card.Content class="space-y-3 text-sm">
							{#if campaign.status === 'sent'}
								<dl class="grid grid-cols-3 gap-2 text-center">
									<div>
										<dt class="text-muted-foreground text-xs">{workspace.t('ui.ws.campaign.recipients')}</dt>
										<dd class="font-semibold">{workspace.i18n.number(campaign.stats.recipients)}</dd>
									</div>
									<div>
										<dt class="text-muted-foreground text-xs">{workspace.t('ui.ws.campaign.opens')}</dt>
										<dd class="font-semibold">{rate(campaign.stats.opens, campaign.stats.recipients)}</dd>
									</div>
									<div>
										<dt class="text-muted-foreground text-xs">{workspace.t('ui.ws.campaign.clicks')}</dt>
										<dd class="font-semibold">{rate(campaign.stats.clicks, campaign.stats.recipients)}</dd>
									</div>
								</dl>
								<p class="text-muted-foreground text-xs">
									{workspace.t('ui.ws.campaign.sent_at', { date: workspace.i18n.dateTime(campaign.sentAt!) })}
								</p>
							{:else if campaign.status === 'scheduled' && campaign.scheduledAt}
								<p class="text-muted-foreground">
									{workspace.t('ui.ws.campaign.scheduled_for', { date: workspace.i18n.dateTime(campaign.scheduledAt) })}
								</p>
							{:else}
								<p class="text-muted-foreground">
									{workspace.t('ui.ws.campaign.audience_label', { tag: campaign.audienceTag || '—' })}
								</p>
							{/if}
							{#if canWrite}
								<div class="flex gap-1">
									<Button variant="ghost" size="sm" onclick={() => model.duplicate(campaign)}>
										<Copy class="size-3.5" />{workspace.t('ui.ws.campaign.duplicate')}
									</Button>
									{#if campaign.status !== 'sent'}<Button
											variant="ghost"
											size="sm"
											class="text-destructive"
											onclick={() => model.remove(campaign)}
										>
											<Trash2 class="size-3.5" />{workspace.t('ui.ws.delete')}
										</Button>{/if}
								</div>
							{/if}
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{/snippet}
	</AsyncView>
</ModuleGate>
