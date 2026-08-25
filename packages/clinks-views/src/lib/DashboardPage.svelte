<script lang="ts">
	import type { ApplicationScope } from '@clinks/api-client';
	import { RequireAuth } from '@clinks/auth';
	import DashboardContent from './DashboardContent.svelte';

	let { application }: { application: ApplicationScope } = $props();
</script>

<RequireAuth redirectTo="/login">
	<DashboardContent {application} />
</RequireAuth>
