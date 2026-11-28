<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import { Input } from '@clinks/ui/components/ui/input';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { useWorkspace } from '#lib/workspace.svelte';

	let {
		value = $bindable(''),
		disabled,
		...attributes
	}: Omit<HTMLInputAttributes, 'type' | 'value' | 'files'> & {
		value?: string;
	} = $props();
	const workspace = useWorkspace();
	let visible = $state(false);
</script>

<div class="relative">
	<Input
		{...attributes}
		{disabled}
		type={visible ? 'text' : 'password'}
		class="pr-11 [&::-ms-reveal]:hidden"
		bind:value
	/>
	<button
		type="button"
		class="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
		{disabled}
		aria-label={workspace.t('ui.ws.auth.show_password')}
		aria-pressed={visible}
		onmousedown={(event) => event.preventDefault()}
		onclick={() => (visible = !visible)}
	>
		{#if visible}<EyeOff size={17} aria-hidden="true" />{:else}<Eye size={17} aria-hidden="true" />{/if}
	</button>
</div>
