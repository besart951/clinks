<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import FileText from '@lucide/svelte/icons/file-text';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import * as Alert from '@clinks/ui/components/ui/alert';
	import * as Card from '@clinks/ui/components/ui/card';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import FormField from '#lib/components/common/FormField.svelte';
	import SkeletonRows from '#lib/components/common/SkeletonRows.svelte';
	import LocaleSwitch from '#lib/components/shell/LocaleSwitch.svelte';
	import type { InvoiceLinkDetails } from '@clinks/contracts/finance';
	import { useWorkspace } from '#lib/workspace.svelte';

	// The recipient's side of a secure invoice link: no account, only the postcode of the billing address.
	const workspace = useWorkspace();
	const token = page.params.token ?? '';
	let details = $state<InvoiceLinkDetails | null>(null);
	let fatal = $state('');
	let error = $state('');
	let done = $state('');
	let postcode = $state('');
	let busy = $state(false);

	const title = $derived(
		details
			? details.kind === 'reminder'
				? workspace.t('ui.ws.invoice_link.title_reminder', { level: details.level ?? 1, number: details.number })
				: workspace.t('ui.ws.invoice_link.title', { number: details.number })
			: 'CLinks',
	);

	onMount(async () => {
		try {
			details = await workspace.invoiceDelivery.linkDetails(token);
		} catch (failure) {
			fatal = workspace.message(failure);
		}
	});

	async function open(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			const name = await workspace.invoiceDelivery.open(token, postcode);
			done = workspace.t('ui.ws.invoice_link.opened', { name });
		} catch (failure) {
			error = workspace.message(failure);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="bg-muted/40 grid min-h-dvh place-items-center p-4">
	<div class="w-full max-w-md space-y-4">
		<Card.Root>
			<Card.Header>
				<div class="bg-primary/10 text-primary mb-2 grid size-10 place-items-center rounded-xl">
					<FileText class="size-5" aria-hidden="true" />
				</div>
				<Card.Title><h1 class="text-xl">{title}</h1></Card.Title>
				{#if details}<Card.Description>
						{workspace.t('ui.ws.invoice_link.text', { tenant: details.tenantName })}
					</Card.Description>{/if}
			</Card.Header>
			<Card.Content class="space-y-4">
				{#if fatal}
					<Alert.Root variant="destructive"><Alert.Description>{fatal}</Alert.Description></Alert.Root>
				{:else if !details}
					<SkeletonRows rows={2} />
				{:else}
					<form class="space-y-4" onsubmit={open}>
						<FormField id="link-postcode" label={workspace.t('ui.ws.invoice_link.postcode')} error={error || undefined}>
							<Input
								id="link-postcode"
								autocomplete="postal-code"
								inputmode="text"
								maxlength={12}
								required
								aria-invalid={error ? 'true' : undefined}
								bind:value={postcode}
							/>
						</FormField>
						<Button type="submit" class="w-full" disabled={busy}>{workspace.t('ui.ws.invoice_link.open')}</Button>
					</form>
					<p class="text-sm" role="status">{done}</p>
					<p class="text-muted-foreground flex items-start gap-2 text-xs">
						<ShieldCheck class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						<span>
							{workspace.t('ui.ws.invoice_link.valid_until', { date: workspace.i18n.date(details.expiresAt) })}
							{workspace.t('ui.ws.invoice_link.questions', { tenant: details.tenantName })}
						</span>
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
		<div class="flex justify-center"><LocaleSwitch /></div>
	</div>
</main>
