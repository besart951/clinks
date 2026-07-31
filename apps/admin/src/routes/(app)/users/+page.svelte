<script lang="ts">
	import UserManagementPanel from '@clinks/clinks-views/src/lib/UserManagementPanel.svelte';
	import { getAdminModel } from '$lib/admin-context.svelte.js';

	const model = getAdminModel();
</script>

<UserManagementPanel model={model.userModel} />
