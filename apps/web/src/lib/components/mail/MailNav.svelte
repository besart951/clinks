<script lang="ts">
	import SectionNav from '#lib/components/shell/SectionNav.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
</script>

<SectionNav
	label={workspace.t('ui.ws.module.mail')}
	links={[
		{ path: '/mail', label: 'ui.ws.mail.mailbox', exact: true },
		{ path: '/mail/campaigns', label: 'ui.ws.campaign.title' },
		{ path: '/mail/templates', label: 'ui.ws.mail.templates' },
	]}
/>
