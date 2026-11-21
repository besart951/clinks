<script lang="ts" module>
	export interface AvatarPerson {
		name: string;
		avatarColor: string;
		avatarDataUrl?: string | null;
	}
</script>

<script lang="ts">

	let { person, size = 'md' }: { person: AvatarPerson; size?: 'xs' | 'sm' | 'md' | 'lg' } = $props();

	const initials = $derived(
		person.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join(''),
	);
	const sizes = { xs: 'size-5 text-[9px]', sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-16 text-lg' };
</script>

{#if person.avatarDataUrl}
	<img src={person.avatarDataUrl} alt={person.name} class="{sizes[size]} shrink-0 rounded-full object-cover" />
{:else}
	<span
		class="{sizes[size]} grid shrink-0 place-items-center rounded-full font-semibold text-white"
		style:background-color={person.avatarColor}
		title={person.name}
		aria-hidden="true">{initials}</span
	>
{/if}
