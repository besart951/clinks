<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import * as Card from '@clinks/ui/components/ui/card';
	import LocalePicker from '#lib/components/shell/LocalePicker.svelte';

	/** The frame of a page people open from a mail without an account: invoice links, newsletter sign-up and links. */
	let {
		icon: Icon,
		title,
		description = '',
		children,
	}: { icon: Component; title: string; description?: string; children: Snippet } = $props();
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="bg-muted/40 grid min-h-dvh place-items-center p-4">
	<div class="w-full max-w-md space-y-4">
		<Card.Root>
			<Card.Header>
				<div class="bg-primary/10 text-primary mb-2 grid size-10 place-items-center rounded-xl">
					<Icon class="size-5" aria-hidden="true" />
				</div>
				<Card.Title><h1 class="text-xl">{title}</h1></Card.Title>
				{#if description}<Card.Description>{description}</Card.Description>{/if}
			</Card.Header>
			<Card.Content class="space-y-4">{@render children()}</Card.Content>
		</Card.Root>
		<div class="flex justify-center"><LocalePicker /></div>
	</div>
</main>
