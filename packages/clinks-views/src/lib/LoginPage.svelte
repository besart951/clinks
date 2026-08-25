<script lang="ts">
	import type { ApplicationScope } from '@clinks/api-client';
	import { RedirectAuthenticated } from '@clinks/auth';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import AuthPageShell from './AuthPageShell.svelte';
	import LoginForm from './LoginForm.svelte';

	let {
		application,
		returnPath,
		authenticationFailed = false,
	}: { application: ApplicationScope; returnPath: string; authenticationFailed?: boolean } = $props();
	const runtime = useClinksRuntime();
	const t = (key: string) => runtime.translations.t(key);
</script>

<svelte:head><title>{t('ui.login_meta_title')}</title></svelte:head>

<RedirectAuthenticated redirectTo="/dashboard">
	<AuthPageShell {application}>
		<LoginForm {application} {returnPath} {authenticationFailed} />
	</AuthPageShell>
</RedirectAuthenticated>
