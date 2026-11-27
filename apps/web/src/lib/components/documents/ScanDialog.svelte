<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import Crop from '@lucide/svelte/icons/crop';
	import Contrast from '@lucide/svelte/icons/contrast';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import FormField from '#lib/components/common/FormField.svelte';
	import type { FolderId } from '@clinks/domain/ids';
	import { ScanSession } from '#lib/features/documents/scan-session.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';
	import { renderPage } from './scan-image';

	/**
	 * Scanning with the camera: each photo is a page, cut to the sheet and cleaned up; the pages are saved as one
	 * PDF in `folderId`. On a phone the button opens the camera, on a computer the file picker.
	 */
	let { open = $bindable(false), folderId }: { open: boolean; folderId: FolderId | null } = $props();
	const workspace = useWorkspace();
	const session = new ScanSession(workspace, renderPage);
	let camera = $state<HTMLInputElement | null>(null);

	function close(next: boolean) {
		if (next) return;
		session.discard();
		open = false;
	}

	async function save() {
		if (await session.save(folderId)) open = false;
	}
</script>

{#snippet tool(label: string, Icon: typeof Camera, run: () => void, pressed?: boolean)}
	<button
		type="button"
		class="hover:bg-muted grid size-8 place-items-center rounded-md aria-pressed:bg-primary/10 aria-pressed:text-primary"
		aria-label={label}
		title={label}
		aria-pressed={pressed}
		onclick={run}
	>
		<Icon class="size-4" />
	</button>
{/snippet}

<Dialog.Root {open} onOpenChange={close}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{workspace.t('ui.ws.documents.scan')}</Dialog.Title>
			<Dialog.Description>{workspace.t('ui.ws.documents.scan_text')}</Dialog.Description>
		</Dialog.Header>
		<input
			bind:this={camera}
			type="file"
			accept="image/*"
			capture="environment"
			multiple
			class="sr-only"
			aria-label={workspace.t('ui.ws.documents.scan_add')}
			onchange={(event) => {
				const files = event.currentTarget.files;
				if (files) void session.add([...files]);
				event.currentTarget.value = '';
			}}
		/>
		<ol class="grid grid-cols-2 gap-3 sm:grid-cols-3">
			{#each session.pages as page, index (page.id)}
				<li class="overflow-hidden rounded-lg border">
					<div class="bg-muted/50 grid aspect-[3/4] place-items-center">
						{#if page.rendered}<img
								src={page.rendered.preview}
								alt={workspace.t('ui.ws.documents.scan_page', { number: index + 1 })}
								class="max-h-full max-w-full object-contain"
							/>{:else}<span class="text-muted-foreground text-xs">…</span>{/if}
					</div>
					<div class="flex items-center justify-between gap-0.5 border-t p-1">
						<span class="text-muted-foreground ps-1 text-xs tabular-nums">{index + 1}</span>
						{@render tool(workspace.t('ui.ws.documents.scan_rotate'), RotateCw, () => session.rotate(page.id))}
						{@render tool(
							workspace.t('ui.ws.documents.scan_crop'),
							Crop,
							() => void session.change(page.id, { crop: !page.settings.crop }),
							page.settings.crop,
						)}
						{@render tool(
							workspace.t('ui.ws.documents.scan_enhance'),
							Contrast,
							() => void session.change(page.id, { enhance: !page.settings.enhance }),
							page.settings.enhance,
						)}
						{#if index > 0}{@render tool(workspace.t('ui.ws.documents.scan_earlier'), ArrowLeft, () =>
								session.move(page.id, -1),
							)}{/if}
						{#if index < session.pages.length - 1}{@render tool(
								workspace.t('ui.ws.documents.scan_later'),
								ArrowRight,
								() => session.move(page.id, 1),
							)}{/if}
						{@render tool(workspace.t('ui.ws.delete'), Trash2, () => session.remove(page.id))}
					</div>
				</li>
			{/each}
			<li>
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm"
					onclick={() => camera?.click()}
				>
					<Camera class="size-6" />{workspace.t(
						session.pages.length ? 'ui.ws.documents.scan_more' : 'ui.ws.documents.scan_add',
					)}
				</button>
			</li>
		</ol>
		<FormField id="scan-name" label={workspace.t('ui.ws.contacts.name')}>
			<Input id="scan-name" bind:value={session.name} />
		</FormField>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => close(false)}>{workspace.t('ui.ws.cancel')}</Button>
			<Button onclick={save} disabled={!session.ready || session.busy}>
				{workspace.t('ui.ws.documents.scan_save', { count: session.pages.length })}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
