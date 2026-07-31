<script lang="ts">
	import LocalizationPanel from '@clinks/clinks-views/src/lib/LocalizationPanel.svelte';
	import { getAdminModel } from '$lib/admin-context.svelte.js';

	const model = getAdminModel();
</script>

<LocalizationPanel model={model.localizationModel} />
