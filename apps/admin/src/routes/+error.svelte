<script lang="ts">
	import { page } from '$app/stores';
	import ErrorPage from '@clinks/clinks-views/error-page';
</script>

<ErrorPage status={$page.status} message={$page.error?.message} />
