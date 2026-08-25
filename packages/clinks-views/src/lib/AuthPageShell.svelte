<script lang="ts">
	import type { ApplicationScope } from '@clinks/api-client';
	import { useClinksRuntime } from '@clinks/clinks-runtime';
	import type { Snippet } from 'svelte';
	import ProductHeader from './ProductHeader.svelte';

	let { application, children }: { application: ApplicationScope; children: Snippet } = $props();
	const t = (key: string) => useClinksRuntime().translations.t(key);
</script>

<main class="bg-background text-foreground relative min-h-screen overflow-hidden">
	<div
		class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_32%),linear-gradient(to_right,color-mix(in_oklab,var(--border)_45%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_45%,transparent)_1px,transparent_1px)] bg-[size:auto,42px_42px,42px_42px]"
	></div>
	<div class="relative">
		<ProductHeader {application} />
		<div
			class="mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_28rem] lg:py-16"
		>
			<section class="hidden max-w-2xl lg:block">
				<p class="text-muted-foreground mb-5 text-sm font-medium tracking-[0.2em] uppercase">
					{t(`ui.auth_eyebrow_${application}`)}
				</p>
				<h1 class="max-w-xl text-5xl leading-[1.05] font-semibold tracking-[-0.04em]">
					{t(`ui.auth_panel_title_${application}`)}
				</h1>
				<p class="text-muted-foreground mt-6 max-w-lg text-lg leading-8">
					{t(`ui.auth_panel_description_${application}`)}
				</p>
			</section>
			<section
				class="bg-card border-border mx-auto w-full max-w-md rounded-3xl border p-6 shadow-2xl shadow-black/5 sm:p-9"
			>
				{@render children()}
			</section>
		</div>
	</div>
</main>
