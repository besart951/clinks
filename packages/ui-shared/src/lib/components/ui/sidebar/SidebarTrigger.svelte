<script lang="ts">
	import { getSidebarContext } from './context.svelte.js';
	import { Button } from '../button/index.js';
	import { Menu } from '@lucide/svelte';

	const ctx = getSidebarContext();
</script>

<Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => ctx.toggle()} aria-label="Toggle sidebar">
	<Menu class="h-4 w-4" />
</Button>
