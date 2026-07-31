<script lang="ts">
	import SystemOverview from '@clinks/clinks-views/src/lib/SystemOverview.svelte';
	import UserManagementPanel from '@clinks/clinks-views/src/lib/UserManagementPanel.svelte';
	import TenantPanel from '@clinks/clinks-views/src/lib/TenantPanel.svelte';
	import InvitationPanel from '@clinks/clinks-views/src/lib/InvitationPanel.svelte';
	import LocalizationPanel from '@clinks/clinks-views/src/lib/LocalizationPanel.svelte';
	import AuditPanel from '@clinks/clinks-views/src/lib/AuditPanel.svelte';
	import { getAdminModel } from '$lib/admin-context.svelte.js';

	const model = getAdminModel();
</script>

<SystemOverview model={model.statsModel} />
<div class="mt-6 grid gap-6 lg:grid-cols-2">
	<UserManagementPanel model={model.userModel} />
	<TenantPanel model={model.tenantModel} />
	<InvitationPanel model={model.invitationModel} />
	<LocalizationPanel model={model.localizationModel} />
	<AuditPanel model={model.auditLogModel} />
</div>
