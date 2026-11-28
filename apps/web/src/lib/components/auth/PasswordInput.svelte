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

<div class="grid min-w-0 gap-1">
	<Input {...attributes} {disabled} type={visible ? 'text' : 'password'} class="[&::-ms-reveal]:hidden" bind:value />
	<button
		type="button"
		class="text-foreground focus-visible:outline-ring flex min-h-9 items-center gap-2 justify-self-end rounded-md px-2 text-sm hover:underline focus-visible:outline-2"
		{disabled}
		onmousedown={(event) => event.preventDefault()}
		onclick={() => (visible = !visible)}
	>
		{#if visible}<EyeOff size={17} aria-hidden="true" />{:else}<Eye size={17} aria-hidden="true" />{/if}
		{workspace.t(visible ? 'ui.ws.auth.hide_password' : 'ui.ws.auth.show_password')}
	</button>
</div>
