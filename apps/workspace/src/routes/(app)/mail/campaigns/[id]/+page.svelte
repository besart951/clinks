<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Textarea } from '@clinks/ui-shared/components/ui/textarea';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import FormField from '$lib/components/common/FormField.svelte';
	import Choice from '$lib/components/common/Choice.svelte';
	import StatusBadge from '$lib/components/common/StatusBadge.svelte';
	import UnsavedChangesGuard from '$lib/components/common/UnsavedChangesGuard.svelte';
	import { campaignTone } from '$lib/components/common/tones';
	import ModuleGate from '$lib/components/shell/ModuleGate.svelte';
	import { CampaignEditorModel } from '$lib/features/mail/campaign.svelte';
	import { fillPlaceholders, placeholders } from '$lib/features/mail/templates';
	import type { CampaignId } from '$lib/domain/ids';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new CampaignEditorModel(workspace, page.params.id as CampaignId);
	const sample = $derived(model.recipients[0] ?? null);
	const company = $derived(workspace.session.tenant?.name ?? '');
	onMount(() => model.resource.connect());

	function insert(placeholder: string) {
		model.value.body = `${model.value.body}{${placeholder}}`;
	}
</script>

<svelte:head><title>{model.value.name || workspace.t('ui.ws.campaign.title')} · CLinks</title></svelte:head>
<UnsavedChangesGuard dirty={model.dirty} />

<ModuleGate module="mail" permission="mail.read">
	<AsyncView resource={model.resource} skeleton="detail">
		{#snippet children({ campaign })}
			<PageHeader title={model.value.name} crumbs={[{ label: workspace.t('ui.ws.campaign.title'), path: '/mail/campaigns' }, { label: model.value.name }]}>
				{#snippet actions()}
					<StatusBadge tone={campaignTone[campaign.status]} label={workspace.t(`ui.ws.campaign.status.${campaign.status}`)} />
					{#if model.editable}<Button variant="outline" disabled={!model.dirty || model.busy} onclick={() => model.save()}>{workspace.t('ui.save')}</Button>{/if}
					{#if campaign.status === 'draft' && model.editable}<Button onclick={() => model.transition('review')}>{workspace.t('ui.ws.campaign.submit_review')}</Button>{/if}
					{#if campaign.status === 'review'}
						<Button variant="outline" onclick={() => model.transition('draft')}>{workspace.t('ui.ws.campaign.back_to_draft')}</Button>
						{#if model.canApprove}<Button onclick={() => model.transition('approved')}>{workspace.t('ui.ws.campaign.approve')}</Button>{/if}
					{/if}
				{/snippet}
			</PageHeader>

			<div class="grid gap-6 xl:grid-cols-[1fr_24rem]">
				<div class="space-y-6">
					<Card.Root>
						<Card.Content class="space-y-4">
							<fieldset disabled={!model.editable} class="space-y-4">
								<FormField id="cp-name" label={workspace.t('ui.ws.campaign.name')}><Input id="cp-name" bind:value={model.value.name} /></FormField>
								<FormField id="cp-audience" label={workspace.t('ui.ws.campaign.audience')}>
									<Choice id="cp-audience" bind:value={model.value.audienceTag} placeholder={workspace.t('ui.ws.campaign.choose_audience')} options={model.audiences.map((audience) => ({ value: audience.tag, label: workspace.t('ui.ws.campaign.audience_option', { tag: audience.tag, count: audience.count }) }))} />
								</FormField>
								<FormField id="cp-subject" label={workspace.t('ui.ws.mail.subject')} hint={workspace.t('ui.ws.campaign.length', { count: model.value.subject.length })}><Input id="cp-subject" bind:value={model.value.subject} /></FormField>
								<FormField id="cp-preview" label={workspace.t('ui.ws.campaign.preview_text')} hint={workspace.t('ui.ws.campaign.preview_hint')}><Input id="cp-preview" bind:value={model.value.previewText} /></FormField>
								<FormField id="cp-body" label={workspace.t('ui.ws.mail.message')}>
									<div class="space-y-2">
										<div class="flex flex-wrap gap-1">
											{#each placeholders as placeholder (placeholder)}<Button type="button" variant="outline" size="xs" onclick={() => insert(placeholder)}>{`{${placeholder}}`}</Button>{/each}
										</div>
										<Textarea id="cp-body" rows={12} bind:value={model.value.body} class="font-mono text-sm" />
									</div>
								</FormField>
							</fieldset>
						</Card.Content>
					</Card.Root>
				</div>

				<div class="space-y-6">
					<Card.Root>
						<Card.Header><Card.Title>{workspace.t('ui.ws.campaign.checks')}</Card.Title></Card.Header>
						<Card.Content>
							<ul class="space-y-2 text-sm">
								{#each model.checks as check (check.key)}
									<li class="flex gap-2">
										{#if check.level === 'ok'}<CircleCheck class="size-4 shrink-0 text-emerald-600" />{:else if check.level === 'warning'}<TriangleAlert class="size-4 shrink-0 text-amber-600" />{:else}<CircleX class="text-destructive size-4 shrink-0" />{/if}
										<span>{workspace.t(check.key, check.params)}</span>
									</li>
								{/each}
							</ul>
						</Card.Content>
					</Card.Root>

					{#if campaign.status === 'approved' && workspace.session.can('mail.write')}
						<Card.Root>
							<Card.Header><Card.Title>{workspace.t('ui.ws.campaign.sending')}</Card.Title></Card.Header>
							<Card.Content class="space-y-3">
								<FormField id="cp-schedule" label={workspace.t('ui.ws.campaign.schedule_at')}><Input id="cp-schedule" type="datetime-local" bind:value={model.scheduleAt} /></FormField>
								<div class="flex gap-2">
									<Button variant="outline" onclick={() => model.transition('scheduled')}>{workspace.t('ui.ws.campaign.schedule')}</Button>
									<Button onclick={() => model.transition('sent')}>{workspace.t('ui.ws.campaign.send_now', { count: model.recipients.length })}</Button>
								</div>
							</Card.Content>
						</Card.Root>
					{/if}

					<Card.Root>
						<Card.Header>
							<Card.Title>{workspace.t('ui.ws.campaign.preview')}</Card.Title>
							<Card.Description>{sample ? workspace.t('ui.ws.campaign.preview_for', { email: sample.email }) : workspace.t('ui.ws.campaign.preview_sample')}</Card.Description>
						</Card.Header>
						<Card.Content>
							<div class="bg-muted/40 space-y-2 rounded-lg border p-4 text-sm">
								<p class="font-semibold">{fillPlaceholders(model.value.subject, sample, company) || workspace.t('ui.ws.mail.no_subject')}</p>
								<p class="text-muted-foreground text-xs">{model.value.previewText}</p>
								<hr />
								<p class="whitespace-pre-wrap">{fillPlaceholders(model.value.body, sample, company)}</p>
								<p class="text-muted-foreground border-t pt-2 text-[11px]">{workspace.t('ui.ws.campaign.footer', { company })}</p>
							</div>
						</Card.Content>
					</Card.Root>
				</div>
			</div>
		{/snippet}
	</AsyncView>
</ModuleGate>
