<script lang="ts">
	import MapPin from '@lucide/svelte/icons/map-pin';
	import { mapsUrl } from '#lib/maps';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** A small icon that opens the place in Google Maps in a new tab. */
	let { place, class: className = '' }: { place: string; class?: string } = $props();
	const workspace = useWorkspace();
	const label = $derived(workspace.t('ui.ws.maps.open', { place }));
</script>

<a
	href={mapsUrl(place)}
	target="_blank"
	rel="noopener noreferrer"
	class="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring inline-grid size-6 shrink-0 place-items-center rounded-md align-middle focus-visible:ring-2 focus-visible:outline-none {className}"
	aria-label={label}
	title={label}
	onclick={(event) => event.stopPropagation()}
>
	<MapPin class="size-3.5" />
</a>
