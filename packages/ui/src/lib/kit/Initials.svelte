<script lang="ts">
	import { personBadge } from './avatar.ts';

	let { name, size = 'md' }: { name: string; size?: 'sm' | 'md' } = $props();
	const badge = $derived(personBadge(name));
</script>

<span
	class="{size === 'sm'
		? 'size-6 text-[10px]'
		: 'size-7 text-[11px]'} pav grid shrink-0 place-items-center rounded-full font-semibold"
	style:--h={badge.hue}
	aria-hidden="true"
>
	{badge.initials}
</span>
