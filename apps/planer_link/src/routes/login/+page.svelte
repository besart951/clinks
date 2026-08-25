<script lang="ts">
	import { page } from '$app/state';
	import { oidcLoginReturnPath } from '@clinks/auth';
	import LoginPage from '@clinks/clinks-views/login';

	const authenticationFailed = $derived(page.url.searchParams.get('error') === 'authentication_failed');
	const returnPath = $derived(oidcLoginReturnPath(page.url.searchParams));
</script>

<LoginPage application="planer_link" {returnPath} {authenticationFailed} />
