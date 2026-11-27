<script lang="ts">
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Info from '@lucide/svelte/icons/info';
	import Copy from '@lucide/svelte/icons/copy';
	import * as Alert from '@clinks/ui/components/ui/alert';
	import * as Card from '@clinks/ui/components/ui/card';
	import * as Table from '@clinks/ui/components/ui/table';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import StatusBadge from '#lib/components/common/StatusBadge.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import MailDomainCard from '#lib/components/settings/MailDomainCard.svelte';
	import MailSenderDialog from '#lib/components/settings/MailSenderDialog.svelte';
	import NewsletterFormsCard from '#lib/components/newsletter/NewsletterFormsCard.svelte';
	import AppointmentMailCard from '#lib/components/settings/AppointmentMailCard.svelte';
	import { MailSettingsModel } from '#lib/features/settings/mail.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new MailSettingsModel(workspace);
	onMount(() => model.resource.connect());

	function addDomain(event: SubmitEvent) {
		event.preventDefault();
		void model.addDomain();
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.settings.mail')} · CLinks</title></svelte:head>

<ModuleGate permission="settings.manage">
	<PageHeader title={workspace.t('ui.ws.settings.mail')} description={workspace.t('ui.ws.mail_settings.text')} />
	<AsyncView resource={model.resource}>
		{#snippet children({ settings, members })}
			<div class="space-y-6">
				{#if !settings.relay}
					<Alert.Root>
						<Info class="size-4" />
						<Alert.Description>{workspace.t('ui.ws.mail_settings.no_relay')}</Alert.Description>
					</Alert.Root>
				{:else if model.demo}
					<Alert.Root>
						<Info class="size-4" />
						<Alert.Description>{workspace.t('ui.ws.mail_settings.demo')}</Alert.Description>
					</Alert.Root>
				{/if}
				<Card.Root>
					<Card.Header>
						<Card.Title><h2>{workspace.t('ui.ws.mail_settings.domains')}</h2></Card.Title>
						<Card.Description>{workspace.t('ui.ws.mail_settings.domains_text')}</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						{#each settings.domains as domain (domain.id)}
							<MailDomainCard {domain} {model} />
						{/each}
						<form class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end" onsubmit={addDomain}>
							<FormField
								id="md-domain"
								label={workspace.t('ui.ws.mail_settings.domain')}
								error={model.domainError || undefined}
							>
								<Input id="md-domain" placeholder="praxis.ch" autocomplete="off" required bind:value={model.domain} />
							</FormField>
							<FormField id="md-purpose" label={workspace.t('ui.ws.mail_settings.purpose')}>
								<Choice
									id="md-purpose"
									bind:value={model.purpose}
									options={(['business', 'newsletter'] as const).map((purpose) => ({
										value: purpose,
										label: workspace.t(`ui.ws.mail_settings.purpose_${purpose}`),
									}))}
								/>
							</FormField>
							<Button type="submit" disabled={model.busy}>
								<Plus class="size-4" />{workspace.t('ui.ws.mail_settings.add_domain')}
							</Button>
						</form>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header>
						<Card.Title><h2>{workspace.t('ui.ws.mail_settings.filing')}</h2></Card.Title>
						<Card.Description>{workspace.t('ui.ws.mail_settings.filing_text')}</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-3">
						{#if settings.filingAddress}
							<div class="bg-muted/40 flex min-w-0 items-center gap-2 rounded-md p-3">
								<code class="min-w-0 flex-1 font-mono text-sm break-all">{settings.filingAddress}</code>
								<Button
									size="icon"
									variant="ghost"
									class="size-8 shrink-0"
									aria-label={workspace.t('ui.ws.mail_settings.copy', { what: settings.filingAddress })}
									onclick={() => model.copy(settings.filingAddress!)}
								>
									<Copy class="size-4" />
								</Button>
							</div>
							<ul class="text-muted-foreground list-disc space-y-1 ps-5 text-sm">
								<li>{workspace.t('ui.ws.mail_settings.filing_bcc')}</li>
								<li>{workspace.t('ui.ws.mail_settings.filing_forward')}</li>
							</ul>
						{/if}
						<Button variant="outline" size="sm" disabled={model.busy} onclick={() => model.rotateFilingAddress()}>
							{workspace.t(
								settings.filingAddress ? 'ui.ws.mail_settings.filing_rotate' : 'ui.ws.mail_settings.filing_create',
							)}
						</Button>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header>
						<Card.Title><h2>{workspace.t('ui.ws.mail_settings.senders')}</h2></Card.Title>
						<Card.Description>{workspace.t('ui.ws.mail_settings.senders_text')}</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						{#if settings.senders.length > 0}
							<Table.Root>
								<Table.Header>
									<Table.Row>
										<Table.Head>{workspace.t('ui.ws.mail_settings.address')}</Table.Head>
										<Table.Head class="hidden sm:table-cell">{workspace.t('ui.ws.mail_settings.kind')}</Table.Head>
										<Table.Head>{workspace.t('ui.ws.status')}</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each settings.senders as sender (sender.id)}
										<Table.Row>
											<Table.Cell class="max-w-56">
												<button
													type="button"
													class="block max-w-full truncate text-left font-medium hover:underline"
													onclick={() => model.editSender(sender)}
												>
													{sender.address}
												</button>
												<span class="text-muted-foreground block truncate text-xs">{sender.displayName}</span>
											</Table.Cell>
											<Table.Cell class="hidden sm:table-cell">
												{workspace.t(`ui.ws.mail_settings.kind_${sender.kind}`)}{#if sender.isDefault}
													· {workspace.t('ui.ws.mail_settings.default')}{/if}
											</Table.Cell>
											<Table.Cell>
												<div class="flex items-center gap-2">
													<StatusBadge
														tone={sender.active ? 'success' : 'warning'}
														label={workspace.t(
															sender.active ? 'ui.ws.mail_settings.active' : 'ui.ws.mail_settings.fallback',
														)}
													/>
													<Button size="sm" variant="ghost" onclick={() => model.removeSender(sender.id)}>
														{workspace.t('ui.ws.delete')}
													</Button>
												</div>
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						{/if}
						<div class="flex flex-wrap gap-2">
							{#each ['business', 'personal', 'newsletter'] as const as kind (kind)}
								<Button variant="outline" size="sm" onclick={() => model.newSender(kind)}>
									<Plus class="size-4" />{workspace.t(`ui.ws.mail_settings.add_${kind}`)}
								</Button>
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
				<AppointmentMailCard />
				{#if workspace.session.hasModule('mail')}<NewsletterFormsCard />{/if}
			</div>
			<MailSenderDialog {model} {members} />
		{/snippet}
	</AsyncView>
</ModuleGate>
