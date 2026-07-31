<script lang="ts">
	import AuditPanel from '@clinks/clinks-views/src/lib/AuditPanel.svelte';
	import { getAdminModel } from '$lib/admin-context.svelte.js';

	const model = getAdminModel();
</script>

<AuditPanel model={model.auditLogModel} />
