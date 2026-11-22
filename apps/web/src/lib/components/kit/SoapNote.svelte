<script lang="ts" module>
	import type { ClinicalNote } from '@clinks/domain/types';

	export const soapFields = ['subjective', 'objective', 'assessment', 'plan'] as const;

	export type SoapField = 'subjective' | 'objective' | 'assessment' | 'plan';

	export interface SoapNoteActions {
		save: (field: SoapField, value: string) => unknown;
		remove?: () => void;
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import InlineText from './InlineText.svelte';
	import Initials from '@clinks/ui/kit/Initials.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let {
		note,
		meta,
		actions,
	}: {
		note: ClinicalNote;
		/** Author name, row labels (SOAP for physio, care vocabulary for Spitex) and whether it starts expanded. */
		meta: {
			author: string;
			labels: { [field in SoapField]: string };
			letters?: { [field in SoapField]: string };
			open?: boolean;
		};
		actions: SoapNoteActions | null;
	} = $props();

	const workspace = useWorkspace();
	let open = $state(untrack(() => meta.open ?? false));
	const rows: { field: SoapField; letter: string }[] = [
		{ field: 'subjective', letter: 'S' },
		{ field: 'objective', letter: 'O' },
		{ field: 'assessment', letter: 'A' },
		{ field: 'plan', letter: 'P' },
	];
	const summary = $derived(note.assessment || note.subjective || note.plan);
</script>

<article class="reveal-scope border-b last:border-b-0">
	<button
		type="button"
		class="hover:bg-accent grid w-full grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1 py-2 text-left text-sm"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<span class="text-muted-foreground text-[13px] tabular-nums">{workspace.i18n.date(note.date)}</span>
		<span class="truncate {open ? 'font-medium' : ''}">{summary || '—'}</span>
		<span title={meta.author}><Initials name={meta.author} size="sm" /></span>
	</button>
	{#if open}
		<div class="grid gap-0.5 pb-3 pl-1">
			{#each rows as row (row.field)}
				<div class="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-2">
					<span
						class="bg-muted text-muted-foreground mt-1.5 grid size-5 place-items-center rounded text-[11px] font-semibold"
						title={meta.labels[row.field]}
					>
						{meta.letters?.[row.field] ?? row.letter}
					</span>
					<InlineText
						text={{
							value: note[row.field],
							placeholder: workspace.t('ui.ws.inline.empty'),
							label: meta.labels[row.field],
						}}
						readonly={!actions}
						onsave={(value) => actions?.save(row.field, value)}
					/>
				</div>
			{/each}
			{#if actions?.remove}
				<div class="reveal flex justify-end">
					<button
						type="button"
						class="text-muted-foreground hover:text-destructive inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs"
						onclick={actions.remove}
					>
						<Trash2 class="size-3.5" />{workspace.t('ui.ws.delete')}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</article>
