<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import MailCheck from '@lucide/svelte/icons/mail-check';
	import * as Alert from '@clinks/ui/components/ui/alert';
	import PublicCard from '#lib/components/common/PublicCard.svelte';
	import SkeletonRows from '#lib/components/common/SkeletonRows.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	// The link in the confirmation mail: confirms the sign-up once (a second visit says the link is used up).
	const workspace = useWorkspace();
	let tenant = $state<string | null>(null);
	let fatal = $state('');
	onMount(async () => {
		try {
			tenant = (await workspace.newsletterForms.confirm(page.params.token ?? '')).tenantName;
		} catch (error) {
			fatal = workspace.message(error);
		}
	});
</script>

<PublicCard icon={MailCheck} title={workspace.t('ui.ws.newsletter_public.confirm_title')}>
	{#if fatal}
		<Alert.Root variant="destructive"><Alert.Description>{fatal}</Alert.Description></Alert.Root>
	{:else if tenant === null}
		<SkeletonRows rows={1} />
	{:else}
		<p class="text-sm" role="status">{workspace.t('ui.ws.newsletter_public.confirmed', { tenant })}</p>
	{/if}
</PublicCard>
