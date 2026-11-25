<script lang="ts">
	import Upload from '@lucide/svelte/icons/upload';
	import { Button } from '@clinks/ui/components/ui/button';

	/**
	 * Picks files through a button. The browser's own file field reads «Choose File · No file chosen» in the
	 * browser's language and is a small target on a phone; this shows our label and the chosen file's name.
	 */
	let {
		id,
		label,
		accept,
		multiple = false,
		onpick,
	}: {
		id?: string;
		label: string;
		accept?: string;
		multiple?: boolean;
		onpick: (files: FileList) => void;
	} = $props();
	let input: HTMLInputElement;
	let chosen = $state('');
</script>

<div class="flex min-w-0 items-center gap-2">
	<input
		bind:this={input}
		{id}
		type="file"
		{accept}
		{multiple}
		class="sr-only"
		onchange={(event) => {
			const files = event.currentTarget.files;
			if (!files?.length) return;
			chosen = [...files].map((file) => file.name).join(', ');
			onpick(files);
		}}
	/>
	<Button type="button" variant="outline" size="sm" onclick={() => input.click()}>
		<Upload class="size-4" />{label}
	</Button>
	{#if chosen}<span class="text-muted-foreground min-w-0 truncate text-xs">{chosen}</span>{/if}
</div>
