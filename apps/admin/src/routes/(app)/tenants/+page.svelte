<script lang="ts">
	import TenantPanel from '@clinks/clinks-views/src/lib/TenantPanel.svelte';
	import { getAdminModel } from '$lib/admin-context.svelte.js';

	const model = getAdminModel();
</script>

<TenantPanel model={model.tenantModel} />
