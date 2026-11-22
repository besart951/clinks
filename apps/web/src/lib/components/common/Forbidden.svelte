<script lang="ts">
	import Lock from '@lucide/svelte/icons/lock';
	import { useWorkspace } from '#lib/workspace.svelte';
	import EmptyState from './EmptyState.svelte';

	const workspace = useWorkspace();
</script>

<EmptyState
	icon={Lock}
	title={workspace.t('ui.ws.state.forbidden_title')}
	description={workspace.t('ui.ws.state.forbidden_text')}
/>
