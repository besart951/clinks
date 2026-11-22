<script lang="ts">
	import { onMount } from 'svelte';
	import { landingPath } from '$lib/features/auth/auth-forms.svelte';
	import { navigate } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';
	import SkeletonRows from '$lib/components/common/SkeletonRows.svelte';

	const workspace = useWorkspace();

	onMount(async () => {
		await workspace.session.ready;
		await navigate(landingPath(workspace.session), { replaceState: true });
	});
</script>

<div class="mx-auto max-w-md p-10"><SkeletonRows rows={3} /></div>
