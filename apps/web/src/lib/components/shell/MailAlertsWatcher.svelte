<script lang="ts">
	import { onMount } from 'svelte';
	import { MailAlerts } from '#lib/features/mail/mail-alerts.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Watches the inbox for the whole session, so new mail is announced on any page (see `MailAlerts`). */
	const workspace = useWorkspace();
	const alerts = new MailAlerts(workspace);
	onMount(() => alerts.resource.connect());
</script>
