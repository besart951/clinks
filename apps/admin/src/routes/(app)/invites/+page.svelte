<script lang="ts">
	import InvitationPanel from '@clinks/clinks-views/src/lib/InvitationPanel.svelte';
	import { getAdminModel } from '$lib/admin-context.svelte.js';

	const model = getAdminModel();
</script>

<InvitationPanel model={model.invitationModel} />
