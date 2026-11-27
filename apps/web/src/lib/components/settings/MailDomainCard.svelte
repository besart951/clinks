<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import { Button } from '@clinks/ui/components/ui/button';
	import StatusBadge from '#lib/components/common/StatusBadge.svelte';
	import type { MailDomainView } from '@clinks/contracts/mail';
	import type { MailSettingsModel } from '#lib/features/settings/mail.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { domain, model }: { domain: MailDomainView; model: MailSettingsModel } = $props();
	const workspace = useWorkspace();
	const tone = { pending: 'neutral', verified: 'success', failing: 'danger' } as const;
</script>

<article class="space-y-3 rounded-lg border p-4" aria-labelledby="domain-{domain.id}">
	<header class="flex flex-wrap items-center gap-2">
		<h3 id="domain-{domain.id}" class="font-medium break-all">{domain.domain}</h3>
		<span class="text-muted-foreground text-xs">{workspace.t(`ui.ws.mail_settings.purpose_${domain.purpose}`)}</span>
		<StatusBadge tone={tone[domain.status]} label={workspace.t(`ui.ws.mail_settings.status_${domain.status}`)} />
		<div class="ms-auto flex gap-2">
			<Button size="sm" variant="outline" disabled={model.busy} onclick={() => model.checkDomain(domain.id)}>
				{workspace.t('ui.ws.mail_settings.check')}
			</Button>
			<Button size="sm" variant="ghost" disabled={model.busy} onclick={() => model.removeDomain(domain.id)}>
				{workspace.t('ui.ws.delete')}
			</Button>
		</div>
	</header>
	<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.mail_settings.records_text')}</p>
	<ul class="space-y-2" aria-label={workspace.t('ui.ws.mail_settings.records', { domain: domain.domain })}>
		{#each domain.records as record (record.record)}
			<li class="bg-muted/40 grid gap-1 rounded-md p-3 text-sm">
				<div class="flex items-center gap-2">
					{#if record.ok === true}<CircleCheck class="size-4 text-emerald-600" aria-hidden="true" />
					{:else if record.ok === false}<CircleX class="text-destructive size-4" aria-hidden="true" />
					{:else}<CircleDashed class="text-muted-foreground size-4" aria-hidden="true" />{/if}
					<span class="font-medium">{workspace.t(`ui.ws.mail_settings.record_${record.record}`)}</span>
					<span class="text-muted-foreground text-xs">
						{record.type} ·
						{record.ok === true
							? workspace.t('ui.ws.mail_settings.record_ok')
							: record.ok === false
								? workspace.t('ui.ws.mail_settings.record_missing')
								: workspace.t('ui.ws.mail_settings.record_unchecked')}
					</span>
				</div>
				<dl class="grid gap-1 sm:grid-cols-[6rem_minmax(0,1fr)]">
					<dt class="text-muted-foreground text-xs">{workspace.t('ui.ws.mail_settings.host')}</dt>
					<dd class="flex min-w-0 items-start gap-1">
						<code class="min-w-0 font-mono text-xs break-all">{record.host}</code>
						<Button
							size="icon"
							variant="ghost"
							class="size-7 shrink-0"
							aria-label={workspace.t('ui.ws.mail_settings.copy', { what: record.host })}
							onclick={() => model.copy(record.host)}
						>
							<Copy class="size-3.5" />
						</Button>
					</dd>
					<dt class="text-muted-foreground text-xs">{workspace.t('ui.ws.mail_settings.value')}</dt>
					<dd class="flex min-w-0 items-start gap-1">
						<code class="min-w-0 font-mono text-xs break-all">{record.value}</code>
						<Button
							size="icon"
							variant="ghost"
							class="size-7 shrink-0"
							aria-label={workspace.t('ui.ws.mail_settings.copy', {
								what: workspace.t(`ui.ws.mail_settings.record_${record.record}`),
							})}
							onclick={() => model.copy(record.value)}
						>
							<Copy class="size-3.5" />
						</Button>
					</dd>
					{#if record.ok === false && record.found}
						<dt class="text-muted-foreground text-xs">{workspace.t('ui.ws.mail_settings.found')}</dt>
						<dd><code class="font-mono text-xs break-all">{record.found}</code></dd>
					{/if}
				</dl>
			</li>
		{/each}
	</ul>
</article>
