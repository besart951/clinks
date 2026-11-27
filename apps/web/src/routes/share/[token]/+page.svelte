<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import FileText from '@lucide/svelte/icons/file-text';
	import Download from '@lucide/svelte/icons/download';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import * as Alert from '@clinks/ui/components/ui/alert';
	import { Button } from '@clinks/ui/components/ui/button';
	import SkeletonRows from '#lib/components/common/SkeletonRows.svelte';
	import PublicCard from '#lib/components/common/PublicCard.svelte';
	import type { SharedFileDetails } from '@clinks/contracts/documents';
	import { formatBytes } from '#lib/features/collaboration/attachments.svelte';
	import { bytesOf } from '#lib/data/data-url';
	import { useWorkspace } from '#lib/workspace.svelte';

	// The recipient's side of a «Teilen-Link»: no account, just the file until the link ends.
	const workspace = useWorkspace();
	const token = page.params.token ?? '';
	let details = $state<SharedFileDetails | null>(null);
	let fatal = $state('');
	let done = $state('');
	let busy = $state(false);

	onMount(async () => {
		try {
			details = await workspace.documentShares.details(token);
		} catch (failure) {
			fatal = workspace.message(failure);
		}
	});

	async function download() {
		busy = true;
		try {
			const file = await workspace.documentShares.open(token);
			const bytes = await bytesOf(file.url);
			workspace.platform.files.save(new File([new Uint8Array(bytes)], file.name, { type: file.mimeType }), file.name);
			done = workspace.t('ui.ws.share.downloaded', { name: file.name });
		} catch (failure) {
			fatal = workspace.message(failure);
		} finally {
			busy = false;
		}
	}
</script>

<PublicCard
	icon={FileText}
	title={details ? details.name : 'CLinks'}
	description={details ? workspace.t('ui.ws.share.text', { tenant: details.tenantName }) : ''}
>
	{#if fatal}
		<Alert.Root variant="destructive"><Alert.Description>{fatal}</Alert.Description></Alert.Root>
	{:else if !details}
		<SkeletonRows rows={2} />
	{:else}
		<p class="text-muted-foreground text-sm">{formatBytes(details.size, (value) => workspace.i18n.number(value))}</p>
		<Button class="w-full" onclick={download} disabled={busy}>
			<Download class="size-4" />{workspace.t('ui.ws.share.download')}
		</Button>
		<p class="text-sm" role="status">{done}</p>
		<p class="text-muted-foreground flex items-start gap-2 text-xs">
			<ShieldCheck class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
			<span>{workspace.t('ui.ws.share.valid_until', { date: workspace.i18n.dateTime(details.expiresAt) })}</span>
		</p>
	{/if}
</PublicCard>
