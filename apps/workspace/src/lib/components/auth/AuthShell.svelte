<script lang="ts">
	import type { Snippet } from 'svelte';
	import Link2 from '@lucide/svelte/icons/link-2';
	import { useWorkspace } from '$lib/workspace.svelte';
	import LocaleSwitch from '$lib/components/shell/LocaleSwitch.svelte';

	let { title, description, children, footer }: { title: string; description?: string; children: Snippet; footer?: Snippet } = $props();
	const workspace = useWorkspace();
</script>

<svelte:head><title>{title} · CLinks</title></svelte:head>

<div class="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,32rem)]">
	<aside class="bg-foreground text-background relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
		<div class="flex items-center gap-3 font-semibold">
			<span class="bg-background text-foreground grid size-9 place-items-center rounded-xl"><Link2 class="size-4" /></span>
			CLinks Workspace
		</div>
		<div class="max-w-md space-y-4">
			<p class="text-3xl leading-tight font-semibold tracking-tight">{workspace.t('ui.ws.auth.claim')}</p>
			<p class="text-background/70">{workspace.t('ui.ws.auth.claim_text')}</p>
		</div>
		<ul class="text-background/70 grid grid-cols-2 gap-2 text-sm">
			{#each ['contacts', 'calendar', 'mail', 'finance', 'planner', 'physio', 'spitex', 'documents'] as module (module)}
				<li class="flex items-center gap-2"><span class="bg-background/40 size-1.5 rounded-full"></span>{workspace.t(`ui.ws.module.${module}`)}</li>
			{/each}
		</ul>
		<div class="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-gradient-to-br from-teal-500/40 to-violet-500/40 blur-3xl"></div>
	</aside>
	<main class="flex flex-col px-5 py-6 sm:px-10">
		<div class="flex justify-end"><LocaleSwitch /></div>
		<div class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 py-10">
			<div class="space-y-1.5">
				<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
				{#if description}<p class="text-muted-foreground text-sm">{description}</p>{/if}
			</div>
			{@render children()}
			{#if footer}<div class="text-muted-foreground text-sm">{@render footer()}</div>{/if}
		</div>
	</main>
</div>
