<script lang="ts">
	import type { ApplicationScope } from '@clinks/api-client';
	import { RedirectAuthenticated } from '@clinks/auth';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import AuthPageShell from './AuthPageShell.svelte';
	import SignupForm from './SignupForm.svelte';

	let { application }: { application: ApplicationScope } = $props();
	const runtime = useClinksRuntime();
	const t = (key: string) => runtime.translations.t(key);
</script>

<svelte:head><title>{t('ui.signup_meta_title')}</title></svelte:head>

<RedirectAuthenticated redirectTo="/dashboard">
	<AuthPageShell {application}>
		<SignupForm {application} />
	</AuthPageShell>
</RedirectAuthenticated>
