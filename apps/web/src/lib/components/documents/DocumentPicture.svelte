<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import FileImage from '@lucide/svelte/icons/file-image';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import type { StoredDocument } from '@clinks/domain/types';
	import type { DocumentsModel } from '#lib/features/documents/documents.svelte';

	/**
	 * A picture of a file: pictures show themselves once scrolled into view, other files an icon by their kind.
	 */
	let {
		document,
		model,
		class: className = '',
	}: { document: StoredDocument; model: DocumentsModel; class?: string } = $props();
	let source = $state<string | null>(null);
	const image = $derived(document.mimeType.startsWith('image/'));
	const Icon = $derived(image ? FileImage : /sheet|excel|csv/.test(document.mimeType) ? FileSpreadsheet : FileText);

	/** Loads the picture when it comes into view, so a long folder does not fetch every file at once. */
	function whenVisible(element: HTMLElement) {
		if (!image) return;
		const observer = new IntersectionObserver((entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			observer.disconnect();
			model.picture(document).then(
				(url) => (source = url),
				() => undefined,
			);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}
</script>

<div class="bg-muted/50 grid place-items-center overflow-hidden {className}" {@attach whenVisible}>
	{#if source}
		<img src={source} alt="" class="size-full object-cover" />
	{:else}
		<Icon class="text-muted-foreground size-8" aria-hidden="true" />
	{/if}
</div>
