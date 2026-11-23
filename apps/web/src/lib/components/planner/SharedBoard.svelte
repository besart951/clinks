<script lang="ts">
	import { onMount } from 'svelte';
	import { useWorkspace } from '#lib/workspace.svelte';
	let { endpoint, tenantId, writable }: { endpoint: string; tenantId: string; writable: boolean } = $props();
	const workspace = useWorkspace();
	let host: HTMLDivElement;
	let present = $state(0);
	let online = $state(false);
	onMount(() => {
		let closed = false;
		let cleanup = () => {};
		async function connect() {
			const [{ HocuspocusProvider }, { Editor }, { default: StarterKit }, { default: Collaboration }, { Doc }] =
				await Promise.all([
					import('@hocuspocus/provider'),
					import('@tiptap/core'),
					import('@tiptap/starter-kit'),
					import('@tiptap/extension-collaboration'),
					import('yjs'),
				]);
			if (closed) return;
			const doc = new Doc();
			const editor = new Editor({
				element: host,
				editable: false,
				extensions: [
					StarterKit.configure({ undoRedo: false, link: false }),
					Collaboration.configure({ document: doc }),
				],
				editorProps: {
					attributes: {
						'aria-label': workspace.t('ui.ws.planner.board_notes'),
						class: 'min-h-16 rounded border p-2 text-sm',
					},
				},
			});
			const provider = new HocuspocusProvider({
				url: endpoint,
				name: 'planner/' + tenantId,
				document: doc,
				token: async () => (await workspace.remote?.accessToken()) ?? '',
				onSynced: () => {
					online = true;
					editor.setEditable(writable);
				},
				onDisconnect: () => {
					online = false;
					editor.setEditable(false);
				},
				onAwarenessChange: ({ states }) => {
					present = states.length;
				},
			});
			provider.setAwarenessField('present', true);
			cleanup = () => {
				provider.destroy();
				editor.destroy();
				doc.destroy();
			};
		}
		void workspace.run(connect);
		return () => {
			closed = true;
			cleanup();
		};
	});
</script>

<details class="mb-4 rounded-lg border p-3">
	<summary class="cursor-pointer text-sm font-medium">
		{workspace.t('ui.ws.planner.board_notes')}
		{#if online}<span class="text-muted-foreground ml-2">
				{workspace.t('ui.ws.planner.present', { count: present })}
			</span>{/if}
	</summary>
	<div class="mt-3" bind:this={host}></div>
</details>
