<script lang="ts">
	import { onMount } from 'svelte';
	import { AdminDashboardViewModel, useClinksRuntime } from '@clinks/clinks-runtime';
	import AdminDashboard from '@clinks/clinks-views/admin-dashboard';

	const runtime = useClinksRuntime();
	const model = new AdminDashboardViewModel(
		runtime.client,
		runtime.translations,
		runtime.translations.refresh,
		() => runtime.translations.locale,
	);

	onMount(() => {
		void model.initialize();
	});
</script>

<AdminDashboard {model} translations={runtime.translations} theme={runtime.theme} />
