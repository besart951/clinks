<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Check from '@lucide/svelte/icons/check';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Textarea } from '@clinks/ui-shared/components/ui/textarea';
	import Stepper from '$lib/components/kit/Stepper.svelte';
	import UnderlineTabs from '$lib/components/kit/UnderlineTabs.svelte';
	import Initials from '$lib/components/kit/Initials.svelte';
	import { PeopleDirectory } from '$lib/features/collaboration/people.svelte';
	import { contactName } from '$lib/data/workspace-api';
	import { campaignStatuses } from '$lib/domain/types';
	import { href } from '$lib/navigation';
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
	const people = new PeopleDirectory(workspace);
	let tab = $state('content');
	onMount(() => {
		void people.load();
		return model.resource.connect();
	});

	function insert(placeholder: string) {
		model.value.body = `${model.value.body}{${placeholder}}`;
	}
</script>

<svelte:head><title>{model.value.name || workspace.t('ui.ws.campaign.title')} · CLinks</title></svelte:head>
<UnsavedChangesGuard dirty={model.dirty} />

<ModuleGate module="mail" permission="mail.read">
	<AsyncView resource={model.resource} skeleton="detail">
		{#snippet children({ campaign })}
			{@const statusIndex = campaignStatuses.indexOf(campaign.status)}
			{@const okChecks = model.checks.filter((check) => check.level === 'ok').length}
			<a
				class="text-muted-foreground hover:text-foreground inline-flex h-7 items-center gap-1 pr-2 text-[13px]"
				href={href('/mail/campaigns')}
			>
				<ChevronLeft class="size-4" />{workspace.t('ui.ws.campaign.title')}
			</a>
			<header class="mt-2 mb-4 flex flex-wrap items-start gap-4">
				<div class="grid min-w-56 flex-1 gap-1.5">
					<h1 class="text-[30px] leading-9 font-semibold tracking-tight">{model.value.name}</h1>
					<div class="text-muted-foreground flex flex-wrap items-center gap-2 text-[13px]">
						<StatusBadge
							tone={campaignTone[campaign.status]}
							label={workspace.t(`ui.ws.campaign.status.${campaign.status}`)}
						/>
						<span>{model.value.audienceTag || workspace.t('ui.ws.campaign.choose_audience')}</span>
						<span>·</span>
						<span>{workspace.t('ui.ws.campaign.recipient_count', { count: model.recipients.length })}</span>
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					{#if model.editable && model.dirty}<Button
							variant="outline"
							disabled={model.busy}
							onclick={() => model.save()}
						>
							{workspace.t('ui.save')}
						</Button>{/if}
					{#if campaign.status === 'draft' && model.editable}<Button onclick={() => model.transition('review')}>
							{workspace.t('ui.ws.campaign.submit_review')}
						</Button>{/if}
					{#if campaign.status === 'review'}
						<Button variant="outline" onclick={() => model.transition('draft')}>
							{workspace.t('ui.ws.campaign.back_to_draft')}
						</Button>
					{/if}
				</div>
			</header>
			<div class="mb-4">
				<Stepper
					steps={campaignStatuses.map((status, index) => ({
						label: workspace.t(`ui.ws.campaign.status.${status}`),
						state:
							index < statusIndex || campaign.status === 'sent' ? 'done' : index === statusIndex ? 'current' : 'todo',
					}))}
				/>
			</div>
			{#if campaign.status === 'review'}
				<div
					class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3"
				>
					<span class="grid size-8 place-items-center rounded-full bg-[var(--warning)]/15 text-[var(--warning)]">
						<TriangleAlert class="size-4" />
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-semibold">
							{model.canApprove
								? workspace.t('ui.ws.campaign.review_banner')
								: workspace.t('ui.ws.campaign.review_waiting')}
						</p>
						<p class="text-muted-foreground text-[13px]">{workspace.t('ui.ws.campaign.review_banner_text')}</p>
					</div>
					{#if model.canApprove}<Button onclick={() => model.transition('approved')}>
							{workspace.t('ui.ws.campaign.approve')}
						</Button>{/if}
				</div>
			{/if}
			<UnderlineTabs
				bind:value={tab}
				tabs={[
					{ value: 'content', label: workspace.t('ui.ws.campaign.tab_content') },
					{ value: 'recipients', label: workspace.t('ui.ws.campaign.tab_recipients'), count: model.recipients.length },
					{
						value: 'review',
						label: workspace.t('ui.ws.campaign.tab_review'),
						count: `${okChecks}/${model.checks.length}`,
					},
					...(campaign.status === 'sent'
						? [{ value: 'results', label: workspace.t('ui.ws.campaign.tab_results') }]
						: []),
				]}
			/>

			{#if tab === 'content'}
				<div class="grid gap-6 xl:grid-cols-[1fr_24rem]">
					<div class="space-y-6">
						<Card.Root>
							<Card.Content class="space-y-4">
								<fieldset disabled={!model.editable} class="space-y-4">
									<FormField id="cp-name" label={workspace.t('ui.ws.campaign.name')}>
										<Input id="cp-name" bind:value={model.value.name} />
									</FormField>
									<FormField id="cp-audience" label={workspace.t('ui.ws.campaign.audience')}>
										<Choice
											id="cp-audience"
											bind:value={model.value.audienceTag}
											placeholder={workspace.t('ui.ws.campaign.choose_audience')}
											options={model.audiences.map((audience) => ({
												value: audience.tag,
												label: workspace.t('ui.ws.campaign.audience_option', {
													tag: audience.tag,
													count: audience.count,
												}),
											}))}
										/>
									</FormField>
									<FormField
										id="cp-subject"
										label={workspace.t('ui.ws.mail.subject')}
										hint={workspace.t('ui.ws.campaign.length', { count: model.value.subject.length })}
									>
										<Input id="cp-subject" bind:value={model.value.subject} />
									</FormField>
									<FormField
										id="cp-preview"
										label={workspace.t('ui.ws.campaign.preview_text')}
										hint={workspace.t('ui.ws.campaign.preview_hint')}
									>
										<Input id="cp-preview" bind:value={model.value.previewText} />
									</FormField>
									<FormField id="cp-body" label={workspace.t('ui.ws.mail.message')}>
										<div class="space-y-2">
											<div class="flex flex-wrap gap-1">
												{#each placeholders as placeholder (placeholder)}<Button
														type="button"
														variant="outline"
														size="xs"
														onclick={() => insert(placeholder)}
													>
														{`{${placeholder}}`}
													</Button>{/each}
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
							<Card.Header>
								<Card.Title>{workspace.t('ui.ws.campaign.preview')}</Card.Title>
								<Card.Description>
									{sample
										? workspace.t('ui.ws.campaign.preview_for', { email: sample.email })
										: workspace.t('ui.ws.campaign.preview_sample')}
								</Card.Description>
							</Card.Header>
							<Card.Content>
								<div class="bg-muted/40 space-y-2 rounded-lg border p-4 text-sm">
									<p class="font-semibold">
										{fillPlaceholders(model.value.subject, sample, company) || workspace.t('ui.ws.mail.no_subject')}
									</p>
									<p class="text-muted-foreground text-xs">{model.value.previewText}</p>
									<hr />
									<p class="whitespace-pre-wrap">{fillPlaceholders(model.value.body, sample, company)}</p>
									<p class="text-muted-foreground border-t pt-2 text-[11px]">
										{workspace.t('ui.ws.campaign.footer', { company })}
									</p>
								</div>
							</Card.Content>
						</Card.Root>
					</div>
				</div>
			{:else if tab === 'review'}
				<div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
					<section class="bg-card rounded-xl border p-4 shadow-[var(--shadow-sm)]">
						<header class="mb-2 flex items-center gap-2">
							<h2 class="text-sm font-semibold">{workspace.t('ui.ws.campaign.checks')}</h2>
							<span class="text-muted-foreground text-[13px]">
								{workspace.t('ui.ws.campaign.checks_of', { done: okChecks, total: model.checks.length })}
							</span>
						</header>
						<div class="bg-muted mb-2 h-1.5 overflow-hidden rounded-full">
							<div
								class="bg-success h-full rounded-full transition-[width] duration-500"
								style:width="{(okChecks / Math.max(1, model.checks.length)) * 100}%"
							></div>
						</div>
						<ul class="divide-y">
							{#each model.checks as check (check.key)}
								<li class="flex items-center gap-3 py-2.5 text-sm">
									<span
										class="grid size-6 shrink-0 place-items-center rounded-full {check.level === 'ok'
											? 'bg-success/10 text-success'
											: check.level === 'warning'
												? 'bg-[var(--warning)]/10 text-[var(--warning)]'
												: 'bg-destructive/10 text-destructive'}"
									>
										{#if check.level === 'ok'}<Check
												class="size-3.5"
											/>{:else if check.level === 'warning'}<TriangleAlert class="size-3.5" />{:else}<CircleX
												class="size-3.5"
											/>{/if}
									</span>
									<span class="flex-1">{workspace.t(check.key, check.params)}</span>
									{#if check.level !== 'ok' && model.editable}<Button
											variant="ghost"
											size="sm"
											onclick={() => (tab = 'content')}
										>
											{workspace.t('ui.ws.campaign.fix')} →
										</Button>{/if}
								</li>
							{/each}
						</ul>
					</section>
					<div class="grid gap-4">
						{#if campaign.status === 'approved' && workspace.session.can('mail.write')}
							<Card.Root>
								<Card.Header><Card.Title>{workspace.t('ui.ws.campaign.sending')}</Card.Title></Card.Header>
								<Card.Content class="space-y-3">
									<FormField id="cp-schedule" label={workspace.t('ui.ws.campaign.schedule_at')}>
										<Input id="cp-schedule" type="datetime-local" bind:value={model.scheduleAt} />
									</FormField>
									<div class="flex gap-2">
										<Button variant="outline" onclick={() => model.transition('scheduled')}>
											{workspace.t('ui.ws.campaign.schedule')}
										</Button>
										<Button onclick={() => model.transition('sent')}>
											{workspace.t('ui.ws.campaign.send_now', { count: model.recipients.length })}
										</Button>
									</div>
								</Card.Content>
							</Card.Root>
						{/if}
						<section class="bg-card rounded-xl border p-4 shadow-[var(--shadow-sm)]">
							<h2 class="mb-2 text-sm font-semibold">{workspace.t('ui.ws.campaign.responsibility')}</h2>
							<dl class="grid grid-cols-[8rem_1fr] gap-y-1.5 text-[13px]">
								<dt class="text-muted-foreground">{workspace.t('ui.ws.campaign.approved_by')}</dt>
								<dd>{people.get(campaign.approvedBy)?.name ?? '—'}</dd>
								<dt class="text-muted-foreground">{workspace.t('ui.ws.campaign.scheduled_label')}</dt>
								<dd>{campaign.scheduledAt ? workspace.i18n.dateTime(campaign.scheduledAt) : '—'}</dd>
							</dl>
						</section>
					</div>
				</div>
			{:else if tab === 'recipients'}
				<section class="bg-card rounded-xl border shadow-[var(--shadow-sm)]">
					<ul class="divide-y">
						{#each model.recipients as recipient, index (recipient.id)}
							<li class="rise flex items-center gap-3 px-4 py-2 text-sm" style:--i={Math.min(index, 20)}>
								<Initials name={contactName(recipient)} />
								<a class="flex-1 truncate font-medium hover:underline" href={href(`/contacts/${recipient.id}`)}>
									{contactName(recipient)}
								</a>
								<span class="text-muted-foreground truncate">{recipient.email}</span>
							</li>
						{:else}
							<li class="text-muted-foreground px-4 py-8 text-center text-sm">
								{workspace.t('ui.ws.campaign.choose_audience')}
							</li>
						{/each}
					</ul>
				</section>
			{:else}
				<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					{#each [['recipients', campaign.stats.recipients], ['opens', campaign.stats.opens], ['clicks', campaign.stats.clicks], ['unsubscribes', campaign.stats.unsubscribes]] as const as [key, value] (key)}
						<div class="bg-card grid gap-1 rounded-xl border p-4 shadow-[var(--shadow-sm)]">
							<span class="text-muted-foreground text-[13px]">{workspace.t(`ui.ws.campaign.stat_${key}`)}</span>
							<span class="text-[28px] leading-9 font-semibold tabular-nums">{value}</span>
						</div>
					{/each}
				</div>
			{/if}
		{/snippet}
	</AsyncView>
</ModuleGate>
