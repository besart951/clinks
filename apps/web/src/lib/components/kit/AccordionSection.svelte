<script lang="ts" module>
	export interface SectionSpec {
		/** Stable id; the open state is remembered per browser under it. */
		id: string;
		title: string;
		/** Muted summary after the title: a count, the insurance model … */
		count?: string | number;
		defaultOpen?: boolean;
	}
</script>

<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { rememberSection, sectionOpen } from './section-memory';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { section, tools, children }: { section: SectionSpec; tools?: Snippet; children: Snippet } = $props();

	const preferences = useWorkspace().platform.preferences;
	let open = $state(untrack(() => sectionOpen(preferences, section.id, section.defaultOpen ?? true)));
	const contentId = $derived(`section-${section.id}`);

	function toggle() {
		open = !open;
		rememberSection(preferences, section.id, open);
	}
</script>

<section class="reveal-scope border-b" data-open={open ? '' : undefined}>
	<div class="flex flex-wrap items-center gap-1">
		<button
			type="button"
			class="hover:text-foreground flex min-h-12 min-w-0 flex-auto items-center gap-2 rounded-md px-1 text-left text-[13px] font-semibold"
			aria-expanded={open}
			aria-controls={contentId}
			onclick={toggle}
		>
			<ChevronDown
				class="text-muted-foreground size-4 transition-transform duration-300 ease-[var(--ease-out)] {open
					? ''
					: '-rotate-90'}"
			/>
			<span class="min-w-0 [overflow-wrap:anywhere]">{section.title}</span>
			{#if section.count !== undefined && section.count !== ''}<span
					class="text-muted-foreground font-normal tabular-nums"
				>
					{section.count}
				</span>{/if}
		</button>
		{#if tools}<span class="reveal ms-auto flex max-w-full flex-wrap items-center gap-1">{@render tools()}</span>{/if}
	</div>
	<div
		id={contentId}
		class="grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out)] {open
			? 'grid-rows-[1fr]'
			: 'grid-rows-[0fr]'}"
		inert={!open}
	>
		<!-- Clips for the open/close animation, but 4px wider than the content, so focus rings stay whole. -->
		<div class="-mx-1 -mt-1 overflow-hidden px-1 pt-1">
			<div
				class="pb-3 transition-[opacity,transform] duration-300 ease-[var(--ease-out)] {open
					? 'translate-y-0 opacity-100 delay-75'
					: '-translate-y-1 opacity-0'}"
			>
				{@render children()}
			</div>
		</div>
	</div>
</section>
