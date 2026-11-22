<script lang="ts" module>
	export interface DetailHeaderSpec {
		title: string;
		back: { label: string; path: string };
		/** Muted facts under the title: age, insurer, language … */
		meta?: string[];
		badges?: string[];
		avatar?: { initials: string; hue: number };
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import { href } from '$lib/navigation';

	let { header, actions }: { header: DetailHeaderSpec; actions?: Snippet } = $props();
</script>

<a
	class="text-muted-foreground hover:text-foreground inline-flex h-7 items-center gap-1 pr-2 text-[13px] transition-transform hover:-translate-x-0.5"
	href={href(header.back.path)}
>
	<ChevronLeft class="size-4" />{header.back.label}
</a>
<header class="mt-2 mb-6 flex flex-wrap items-center gap-4">
	{#if header.avatar}
		<span
			class="pav grid size-14 shrink-0 place-items-center rounded-2xl text-xl font-semibold"
			style:--h={header.avatar.hue}
			aria-hidden="true"
		>
			{header.avatar.initials}
		</span>
	{/if}
	<div class="grid min-w-56 flex-1 gap-1.5">
		<h1 class="text-[30px] leading-9 font-semibold tracking-tight">{header.title}</h1>
		{#if (header.meta?.length ?? 0) + (header.badges?.length ?? 0) > 0}
			<div class="text-muted-foreground flex flex-wrap items-center gap-2 text-[13px]">
				{#each header.meta ?? [] as fact (fact)}<span>{fact}</span>{/each}
				{#each header.badges ?? [] as badge (badge)}<span
						class="text-foreground rounded-md border px-1.5 py-px text-xs font-medium"
					>
						{badge}
					</span>{/each}
			</div>
		{/if}
	</div>
	{#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</header>
