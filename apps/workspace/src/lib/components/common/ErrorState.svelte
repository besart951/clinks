<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { useWorkspace } from '$lib/workspace.svelte';

	let { message, onRetry }: { message: string; onRetry: () => void } = $props();
	const workspace = useWorkspace();
</script>

<div role="alert" class="border-destructive/30 bg-destructive/5 flex flex-col items-center gap-3 rounded-xl border px-6 py-10 text-center">
	<CircleAlert class="text-destructive size-6" aria-hidden="true" />
	<div class="space-y-1">
		<p class="font-medium">{workspace.t('ui.ws.state.error_title')}</p>
		<p class="text-muted-foreground text-sm">{message}</p>
	</div>
	<Button variant="outline" size="sm" onclick={onRetry}>{workspace.t('ui.try_again')}</Button>
</div>
