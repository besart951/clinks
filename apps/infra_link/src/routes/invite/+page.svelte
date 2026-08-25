<script lang="ts">
	import { page } from '$app/state';
	import { oidcInvitationReturnPath } from '@clinks/auth';
	import InvitationPage from '@clinks/clinks-views/invitation';

	const token = $derived(page.url.searchParams.get('token') ?? '');
	const completed = $derived(page.url.searchParams.get('completed') === '1');
	const authenticationFailed = $derived(page.url.searchParams.get('error') === 'authentication_failed');
	const flow = $derived({
		token,
		completed,
		authenticationFailed,
		returnPath: oidcInvitationReturnPath(token),
	});
</script>

<InvitationPage application="infra_link" {flow} />
