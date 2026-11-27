<script lang="ts">
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { allNavigationItems } from '#lib/features/shell/navigation-items';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { open = $bindable(false) }: { open: boolean } = $props();
	const workspace = useWorkspace();
	const general = [
		{ keys: ['⌘', 'K'], label: 'ui.ws.shortcuts.palette' },
		{ keys: ['?'], label: 'ui.ws.shortcuts.help' },
		{ keys: ['N'], label: 'ui.ws.shortcuts.new' },
		{ keys: ['Esc'], label: 'ui.ws.shortcuts.close' },
	];
</script>

<Dialog.Root bind:open>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{workspace.t('ui.ws.shortcuts.title')}</Dialog.Title>
			<Dialog.Description>{workspace.t('ui.ws.shortcuts.text')}</Dialog.Description>
		</Dialog.Header>
		{@const page = workspace.pageKeys?.help() ?? []}
		{#if page.length > 0}
			<section aria-labelledby="shortcuts-page">
				<h3 id="shortcuts-page" class="mb-2 text-sm font-semibold">{workspace.t('ui.ws.shortcuts.page')}</h3>
				<dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
					{#each page as shortcut (shortcut.label)}
						<div class="flex items-center justify-between gap-2">
							<dt>{shortcut.label}</dt>
							<dd class="flex shrink-0 gap-1">
								{#each shortcut.keys as key (key)}<kbd class="bg-muted rounded border px-1.5 text-xs">{key}</kbd>{/each}
							</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/if}
		<div class="grid gap-6 sm:grid-cols-2">
			<dl class="space-y-2 text-sm">
				{#each general as shortcut (shortcut.label)}
					<div class="flex items-center justify-between gap-2">
						<dt>{workspace.t(shortcut.label)}</dt>
						<dd class="flex gap-1">
							{#each shortcut.keys as key (key)}<kbd class="bg-muted rounded border px-1.5 text-xs">{key}</kbd>{/each}
						</dd>
					</div>
				{/each}
			</dl>
			<dl class="space-y-2 text-sm">
				{#each allNavigationItems.filter((item) => item.shortcut) as item (item.path)}
					<div class="flex items-center justify-between gap-2">
						<dt>{workspace.t(item.label)}</dt>
						<dd class="flex gap-1">
							<kbd class="bg-muted rounded border px-1.5 text-xs">G</kbd><kbd
								class="bg-muted rounded border px-1.5 text-xs"
							>
								{item.shortcut?.toUpperCase()}
							</kbd>
						</dd>
					</div>
				{/each}
			</dl>
		</div>
	</Dialog.Content>
</Dialog.Root>
