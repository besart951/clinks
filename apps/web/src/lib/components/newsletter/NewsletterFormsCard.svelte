<script lang="ts">
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Copy from '@lucide/svelte/icons/copy';
	import Upload from '@lucide/svelte/icons/upload';
	import * as Card from '@clinks/ui/components/ui/card';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Switch } from '@clinks/ui/components/ui/switch';
	import QrCode from '#lib/components/common/QrCode.svelte';
	import { NewsletterFormsModel } from '#lib/features/settings/newsletter-forms.svelte';
	import NewsletterFormDialog from './NewsletterFormDialog.svelte';
	import ConsentImportDialog from './ConsentImportDialog.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Settings › E-Mail › Newsletter: sign-up forms (link and QR code for the desk) and importing consents. */
	const workspace = useWorkspace();
	const model = new NewsletterFormsModel(workspace);
	onMount(() => model.resource.connect());
</script>

<Card.Root>
	<Card.Header>
		<Card.Title><h2>{workspace.t('ui.ws.newsletter_forms.title')}</h2></Card.Title>
		<Card.Description>{workspace.t('ui.ws.newsletter_forms.text')}</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#each model.resource.data ?? [] as form (form.id)}
			<article class="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_6rem]">
				<div class="min-w-0 space-y-2">
					<div class="flex flex-wrap items-center gap-2">
						<button type="button" class="font-medium hover:underline" onclick={() => model.edit(form)}>
							{form.title}
						</button>
						<span class="text-muted-foreground text-xs">{form.tags.join(', ')}</span>
					</div>
					<div class="bg-muted/40 flex min-w-0 items-center gap-2 rounded-md px-2 py-1">
						<a
							class="min-w-0 flex-1 truncate font-mono text-xs hover:underline"
							href={model.link(form)}
							target="_blank"
							rel="noopener"
						>
							{model.link(form)}
						</a>
						<Button
							size="icon"
							variant="ghost"
							class="size-7 shrink-0"
							aria-label={workspace.t('ui.ws.mail_settings.copy', { what: form.title })}
							onclick={() => model.copy(form)}
						>
							<Copy class="size-4" />
						</Button>
					</div>
					<div class="flex flex-wrap items-center gap-3 text-sm">
						<label class="flex items-center gap-2">
							<Switch checked={form.active} disabled={model.busy} onCheckedChange={() => model.toggle(form)} />
							{workspace.t('ui.ws.newsletter_forms.active')}
						</label>
						<Button variant="ghost" size="sm" disabled={model.busy} onclick={() => model.remove(form)}>
							{workspace.t('ui.ws.newsletter_forms.remove')}
						</Button>
					</div>
				</div>
				<div class="justify-self-start sm:justify-self-end">
					<QrCode value={model.link(form)} label={workspace.t('ui.ws.newsletter_forms.qr', { title: form.title })} />
				</div>
			</article>
		{:else}
			<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.newsletter_forms.empty')}</p>
		{/each}
		<div class="flex flex-wrap gap-2">
			<Button variant="outline" size="sm" onclick={() => model.create()}>
				<Plus class="size-4" />{workspace.t('ui.ws.newsletter_forms.new')}
			</Button>
			{#if workspace.session.can('mail.write')}
				<Button variant="ghost" size="sm" onclick={() => model.startImport()}>
					<Upload class="size-4" />{workspace.t('ui.ws.newsletter_forms.import')}
				</Button>
			{/if}
		</div>
	</Card.Content>
</Card.Root>
<NewsletterFormDialog {model} />
<ConsentImportDialog {model} />
